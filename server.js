require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { generateGeminiReply, SYSTEM_PROMPT } = require('./geminiService');

const app = express();
app.use(express.json());

const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'my_verify_token';

// In-memory conversation store (for demo; replace with database for production)
const conversations = new Map(); // key: userPhone, value: array of {role, content}

// Webhook verification (GET)
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

// Receive messages (POST)
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

        // Initialize conversation history for this user
        if (!conversations.has(from)) {
          conversations.set(from, [
            { role: 'system', content: SYSTEM_PROMPT }
          ]);
        }
        let history = conversations.get(from);
        
        // Keep only last 10 exchanges to avoid token limits
        const recentHistory = history.slice(-10);
        
        try {
          // Generate AI reply
          const aiReply = await generateGeminiReply(userText, recentHistory);
          
          // Save to conversation history
          history.push({ role: 'user', content: userText });
          history.push({ role: 'assistant', content: aiReply });
          conversations.set(from, history);
          
          // Send reply
          await sendWhatsAppMessage(from, aiReply, phoneNumberId);
          
        } catch (error) {
          console.error('Gemini error:', error);
          await sendWhatsAppMessage(from, 'Sorry, I am having trouble responding. Please try again later.', phoneNumberId);
        }
      }
    }
    res.sendStatus(200);
  } else {
    res.sendStatus(404);
  }
});

// Function to send message via WhatsApp API
async function sendWhatsAppMessage(to, message, phoneNumberId) {
  const url = `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`;
  const data = {
    messaging_product: 'whatsapp',
    to: to,
    type: 'text',
    text: { body: message.substring(0, 4096) } // WhatsApp character limit
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));