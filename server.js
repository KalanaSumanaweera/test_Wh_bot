require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { generateGeminiReply, SYSTEM_PROMPT } = require('./geminiService');

const app = express();
app.use(express.json());

const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'my_verify_token';

// Simple in-memory conversation history (for demo)
// For production, use Supabase or similar
const conversations = new Map(); // phone -> array of {role, content}

app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('Webhook verified!');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

app.post('/webhook', async (req, res) => {
  const body = req.body;

  if (body.object === 'whatsapp_business_account' &&
      body.entry?.[0]?.changes?.[0]?.value?.messages) {
    
    const messages = body.entry[0].changes[0].value.messages;
    const phoneNumberId = body.entry[0].changes[0].value.metadata.phone_number_id;

    for (const msg of messages) {
      if (msg.type === 'text') {
        const from = msg.from;
        const userText = msg.text.body;

        console.log(`[${from}] says: ${userText}`);

        // Get or create conversation history for this user
        if (!conversations.has(from)) {
          conversations.set(from, [
            { role: 'system', content: SYSTEM_PROMPT }
          ]);
        }
        let history = conversations.get(from);
        
        // Keep last 10 exchanges to avoid token limits
        const recentHistory = history.slice(-10);
        
        try {
          // Get AI reply
          const aiReply = await generateGeminiReply(userText, recentHistory);
          
          // Check if the AI reply contains an order confirmation JSON
          let finalReply = aiReply;
          let orderData = null;
          
          const orderMatch = aiReply.match(/\{"order_confirmed"\s*:\s*true.*?\}/);
          if (orderMatch) {
            try {
              orderData = JSON.parse(orderMatch[0]);
              finalReply = aiReply.replace(orderMatch[0], '').trim();
              // If the AI confirms order, we can save it to database later
              console.log('Order confirmed:', orderData);
            } catch(e) { /* ignore */ }
          }
          
          // Save AI response to history
          history.push({ role: 'user', content: userText });
          history.push({ role: 'assistant', content: aiReply });
          conversations.set(from, history);
          
          // Send reply to user
          await sendWhatsAppMessage(from, finalReply || aiReply, phoneNumberId);
          
          // If order confirmed, optionally notify owner
          if (orderData) {
            await notifyOwner(from, orderData);
          }
          
        } catch (error) {
          console.error('Gemini error:', error);
          await sendWhatsAppMessage(from, 'Sorry, I am having trouble. Please try again later.', phoneNumberId);
        }
      }
    }
    res.sendStatus(200);
  } else {
    res.sendStatus(404);
  }
});

async function sendWhatsAppMessage(to, message, phoneNumberId) {
  const url = `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`;
  const data = {
    messaging_product: 'whatsapp',
    to: to,
    type: 'text',
    text: { body: message.substring(0, 4096) } // WhatsApp limit
  };
  const headers = {
    Authorization: `Bearer ${ACCESS_TOKEN}`,
    'Content-Type': 'application/json'
  };

  try {
    const response = await axios.post(url, data, { headers });
    console.log('Reply sent to', to);
  } catch (error) {
    console.error('Error sending reply:', error.response?.data || error.message);
  }
}

async function notifyOwner(customerNumber, orderData) {
  const ownerNumber = process.env.OWNER_WHATSAPP_NUMBER;
  if (!ownerNumber) return;
  
  let itemsText = '';
  orderData.items.forEach(item => {
    itemsText += `${item.quantity}x ${item.name} - $${(item.price * item.quantity).toFixed(2)}\n`;
  });
  const message = `📞 NEW ORDER from ${customerNumber}\n\n${itemsText}\nTotal: $${orderData.items.reduce((sum, i) => sum + (i.price * i.quantity), 0).toFixed(2)}\n\nPlease confirm preparation.`;
  
  await sendWhatsAppMessage(ownerNumber, message, process.env.WHATSAPP_PHONE_NUMBER_ID);
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));