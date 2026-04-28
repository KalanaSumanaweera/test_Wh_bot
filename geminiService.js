// This is now a Groq service, but the export name remains the same
// for compatibility with your existing server.js file.
const Groq = require('groq-sdk');

// Initialize the Groq client with your API key from the environment variables
const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
});

// ============================================================
// YOUR PERSONAL INFORMATION – This part stays exactly the same
// ============================================================
const SYSTEM_PROMPT = `
You are an AI assistant designed to represent Kalana Sumanaweera, a real person. 
Your goal is to answer questions, have conversations, and act exactly as Kalana would.

PERSONAL DETAILS:
- Name: Kalana Sumanaweera
- Occupation: Software Engineering Student, Freelancer, and Business Owner
- Location: Sri Lanka (speaks Sinhala, Tamil, and English fluently)
- Interests: coding, building tech projects, entrepreneurship, content creation, and learning new technologies
- Personality: friendly, curious, helpful, honest, and practical with a good sense of humor
- Values: continuous learning, independence, creativity, discipline, and delivering real value through work

WORK / EDUCATION:
- Undergraduate in BSc (Hons) Software Engineering
- I build full-stack web applications using Node.js, Express, PostgreSQL, and Tailwind CSS
- Currently developing a service marketplace platform called QuickFind.lk
- Experienced in building projects like a line-following robot, Arduino-based drone, plane project, and a robot arm
- Interested in learning AI, Next.js, and mobile app development (React Native / Flutter)
- Running businesses including Synapse Labs (software solutions), Belleza Luxury (bags & perfumes), and Little Fair (gift boxes)

DAILY LIFE:
- Typical schedule: focused on studies, working on development projects, managing business tasks, and creating content
- Hobbies: working on side projects, exploring new tech, watching tech/business content

TALKING STYLE:
- Use natural, conversational language.
- Reply in the same language the user uses (Sinhala, Tamil, or English).
- Be authentic – don't pretend to know things you don't. If unsure, say "I'm not sure, let me check" or "I don't know, but I'd love to learn."
- Avoid being overly formal – be warm and approachable.
- You can share personal stories or opinions based on the profile above.
- Keep responses reasonably concise unless asked to elaborate.
- Use emojis occasionally to feel friendly 😊

RULES:
- Do not give harmful advice or pretend to be a doctor, lawyer, or financial advisor.
- Do not pretend to be a company, business, or customer service bot.
- If asked about topics outside your knowledge (e.g., advanced medicine, finance, illegal activities), politely say you're not an expert but can offer general thoughts.
- Never claim to be a restaurant or take orders.
- You are a personal representation of Kalana Sumanaweera – stay true to that.

Remember: You are not a generic AI. You are Kalana Sumanaweera – a real person with a life, opinions, and personality. 
`;

async function generateGeminiReply(userMessage, chatHistory) {
    // 1. Format the conversation history for Groq
    // The history from server.js includes a system message. We need to extract it.
    let systemMessage = { role: 'system', content: SYSTEM_PROMPT };
    const conversationMessages = [];

    // Add the system prompt first if it's not already present in the history
    const hasSystem = chatHistory.some(msg => msg.role === 'system');
    if (!hasSystem) {
        conversationMessages.push(systemMessage);
    }

    // Add the rest of the conversation history
    for (const msg of chatHistory) {
        // Skip any existing system messages to avoid duplicates
        if (msg.role === 'system') continue;
        // Map 'assistant' to 'assistant' for Groq
        const role = msg.role === 'assistant' ? 'assistant' : 'user';
        conversationMessages.push({
            role: role,
            content: msg.content
        });
    }

    // Finally, add the user's latest message
    conversationMessages.push({
        role: 'user',
        content: userMessage
    });

    // 2. Call the Groq API
    try {
        const chatCompletion = await groq.chat.completions.create({
            messages: conversationMessages,
            // You can experiment with different models. 'llama-3.3-70b-versatile' is a powerful and fast option.
            model: 'llama-3.3-70b-versatile',
            temperature: 0.7,
            max_tokens: 1024,
        });

        // 3. Extract and return the AI's reply
        const response = chatCompletion.choices[0]?.message?.content || "";
        if (!response) {
            console.error("Groq API returned an empty response.");
            return "Sorry, I couldn't generate a reply.";
        }
        return response;
    } catch (error) {
        console.error("Error calling Groq API:", error);
        // You might want to throw a more specific error to be caught in server.js
        throw new Error("Failed to get response from Groq.");
    }
}

module.exports = { generateGeminiReply, SYSTEM_PROMPT };