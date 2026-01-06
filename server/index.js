const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const fs = require('fs').promises;
const path = require('path');
const { MongoClient } = require('mongodb');

const mongoose = require('mongoose');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Serve static files from the parent directory (where index.html, css, js are located)
app.use(express.static(path.join(__dirname, '..')));

mongoose.connect(process.env.MONGO_URI || 'mongodb+srv://kelvincharming_db_user:h8bQKiy1mugRK58Q@project.l1xacsf.mongodb.net/tasty_bites?appName=Project', {
 
})
.then(async () => {
  console.log('Connected to MongoDB');
  // Create collections if they don't exist
  const db = mongoose.connection.db;
  try {
    await db.createCollection('orders');
    await db.createCollection('payments');
    await db.createCollection('feedbacks');
    console.log('Collections created or already exist');
  } catch (err) {
    console.log('Collections may already exist:', err.message);
  }
})
.catch(err => console.error('Failed to connect to MongoDB', err));

// Define Mongoose schemas
const orderSchema = new mongoose.Schema({
  orderId: { type: String, required: true, unique: true },
  items: { type: Array, required: true },
  customerPhone: { type: String, required: true },
  totalAmount: { type: Number, required: true },
  paymentMethod: { type: String, default: 'mpesa' },
  status: { type: String, default: 'pending' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const paymentSchema = new mongoose.Schema({
  receivedAt: { type: Date, default: Date.now },
  type: String,
  MerchantRequestID: String,
  CheckoutRequestID: String,
  ResultCode: Number,
  ResultDesc: String,
  metadata: Object,
  raw: Object,
  payload: Object
}, { strict: false }); // Allow additional fields

const feedbackSchema = new mongoose.Schema({
  customerName: String,
  customerEmail: String,
  rating: { type: Number, min: 1, max: 5 },
  comment: String,
  aiResponse: String,
  createdAt: { type: Date, default: Date.now }
});

const Order = mongoose.model('Order', orderSchema);
const Payment = mongoose.model('Payment', paymentSchema);
const Feedback = mongoose.model('Feedback', feedbackSchema);

// Initialize Google Generative AI client
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);

// ...existing code...

const DATA_DIR = path.join(__dirname, 'data');
const PAYMENTS_FILE = path.join(DATA_DIR, 'payments.json');

// MongoDB setup (optional)
const MONGO_URI = process.env.MONGO_URI;
let mongoClient = null;
let paymentsCollection = null;
let ordersCollection = null;

async function initMongo() {
  if (!MONGO_URI) return;
  try {
    mongoClient = new MongoClient(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    await mongoClient.connect();
    const dbName = process.env.MONGO_DB || 'tasty_bites';
    const db = mongoClient.db(dbName);
    
    // Create collections if they don't exist
    await db.createCollection('orders');
    await db.createCollection('payments');
    
    paymentsCollection = db.collection('payments');
    ordersCollection = db.collection('orders');
    console.log('Connected to MongoDB, using database', dbName);
  } catch (err) {
    console.error('Failed to connect to MongoDB:', err.message);
    mongoClient = null;
    paymentsCollection = null;
    ordersCollection = null;
  }
}

initMongo();

const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

app.get('/health', (req, res) => res.json({ ok: true }));

// POST /api/mpesa/stk-push
// body: { phone: '7XXXXXXXX', amount: 1000 }
app.post('/api/mpesa/stk-push', async (req, res) => {
  const { phone, amount } = req.body;

  if (!phone || !amount) {
    return res.status(400).json({ error: 'phone and amount are required' });
  }

  // If Daraja credentials are not provided, simulate success
  const consumerKey = process.env.DARAJA_CONSUMER_KEY;
  const consumerSecret = process.env.DARAJA_CONSUMER_SECRET;

  if (!consumerKey || !consumerSecret) {
    // Simulate an STK push (for local dev)
    console.log('Simulating STK push for', phone, amount);
    return res.json({ simulated: true, message: 'STK push simulated. Ask user to confirm on phone.' });
  }

  try {
    // Get access token
    const tokenRes = await axios.get('https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials', {
      auth: {
        username: consumerKey,
        password: consumerSecret
      }
    });

    const accessToken = tokenRes.data.access_token;

    // Build STK push request for sandbox (adjust timestamp/credentials in prod)
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0,14);
    const shortCode = process.env.BUSINESS_SHORTCODE || process.env.DARAJA_SHORTCODE || '174379';
    const passkey = process.env.DARAJA_PASSKEY || '';
    const password = Buffer.from(shortCode + passkey + timestamp).toString('base64');

    const stkBody = {
      BusinessShortCode: shortCode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: amount,
      PartyA: `254${phone}`,
      PartyB: shortCode,
      PhoneNumber: `254${phone}`,
      CallBackURL: process.env.DARAJA_CALLBACK_URL || 'https://example.com/mpesa/callback',
      AccountReference: 'TastyBitesOrder',
      TransactionDesc: 'Payment for Tasty Bites order'
    };

    const stkRes = await axios.post('https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest', stkBody, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    return res.json({ simulated: false, data: stkRes.data });
  } catch (err) {
    console.error('STK push error', err.response ? err.response.data : err.message);
    return res.status(500).json({ error: 'STK push failed', detail: err.response ? err.response.data : err.message });
  }
});

// M-Pesa callback endpoint
// Safaricom will POST the payment confirmation here (JSON). We persist callbacks to a JSON file.
app.post('/api/mpesa/callback', async (req, res) => {
  const payload = req.body;
  const receivedAt = new Date().toISOString();

  // Basic validation: ensure there is a body
  if (!payload || Object.keys(payload).length === 0) {
    return res.status(400).json({ error: 'Empty callback payload' });
  }

  // Try to extract STK callback details if present
  let record = { receivedAt, payload };

  try {
    const stk = payload.Body && payload.Body.stkCallback;
    if (stk) {
      const { MerchantRequestID, CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata } = stk;
      const meta = {};
      if (CallbackMetadata && Array.isArray(CallbackMetadata.Item)) {
        CallbackMetadata.Item.forEach(item => {
          if (item.Name) meta[item.Name] = item.Value;
        });
      }

      record = {
        receivedAt,
        type: 'stkCallback',
        MerchantRequestID,
        CheckoutRequestID,
        ResultCode,
        ResultDesc,
        metadata: meta,
        raw: stk
      };
    }

    // Save to MongoDB using Mongoose
    try {
      const payment = new Payment(record);
      await payment.save();
      console.log('Saved MPesa callback to MongoDB:', record.type || 'unknown');
      return res.status(200).json({ status: 'received', stored: 'mongodb' });
    } catch (dbErr) {
      console.error('Failed to save to MongoDB, falling back to file:', dbErr.message);
      // File fallback
      await fs.mkdir(DATA_DIR, { recursive: true });
      let existing = [];
      try {
        const content = await fs.readFile(PAYMENTS_FILE, 'utf8');
        existing = JSON.parse(content || '[]');
      } catch (e) {
        existing = [];
      }
      existing.push(record);
      await fs.writeFile(PAYMENTS_FILE, JSON.stringify(existing, null, 2), 'utf8');
      console.log('Saved MPesa callback to file:', record.type || 'unknown');
      return res.status(200).json({ status: 'received', stored: 'file' });
    }
  } catch (err) {
    console.error('Error saving MPesa callback', err);
    return res.status(500).json({ error: 'failed to save callback' });
  }
});

// POST /api/orders
// Save order details to database
app.post('/api/orders', async (req, res) => {
  const { items, customerPhone, totalAmount, paymentMethod } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items array is required and cannot be empty' });
  }

  if (!customerPhone || !totalAmount) {
    return res.status(400).json({ error: 'customerPhone and totalAmount are required' });
  }

  const order = {
    orderId: `TB-${Date.now()}`,
    items,
    customerPhone,
    totalAmount,
    paymentMethod: paymentMethod || 'mpesa',
    status: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  try {
    // Save to MongoDB using Mongoose
    const newOrder = new Order(order);
    await newOrder.save();
    console.log('Saved order to MongoDB:', order.orderId);
    return res.json({ success: true, orderId: order.orderId, stored: 'mongodb' });
  } catch (dbErr) {
    console.error('Failed to save to MongoDB, falling back to file:', dbErr.message);
    // File fallback for orders
    const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
    await fs.mkdir(DATA_DIR, { recursive: true });
    let existingOrders = [];
    try {
      const content = await fs.readFile(ORDERS_FILE, 'utf8');
      existingOrders = JSON.parse(content || '[]');
    } catch (e) {
      existingOrders = [];
    }
    existingOrders.push(order);
    await fs.writeFile(ORDERS_FILE, JSON.stringify(existingOrders, null, 2), 'utf8');
    console.log('Saved order to file:', order.orderId);
    return res.json({ success: true, orderId: order.orderId, stored: 'file' });
  }
});

// POST /api/feedback
// Submit customer feedback and get AI response
app.post('/api/feedback', async (req, res) => {
  const { customerName, customerEmail, rating, comment } = req.body;

  if (!rating || !comment) {
    return res.status(400).json({ error: 'rating and comment are required' });
  }

  try {
    // Generate AI response using Google Generative AI
    let aiResponse = '';
    try {
      if (process.env.GOOGLE_AI_API_KEY) {
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
        const prompt = `You are a helpful restaurant assistant. Respond to customer feedback professionally and empathetically. Customer feedback: Rating ${rating}/5. Comment: ${comment}. Please provide a brief response thanking them and addressing their feedback.`;
        
        const result = await model.generateContent(prompt);
        const response = await result.response;
        aiResponse = response.text().trim();
      } else {
        aiResponse = 'Thank you for your feedback! We appreciate your input and will use it to improve our service.';
      }
    } catch (aiErr) {
      console.error('AI generation failed, using default response:', aiErr.message);
      aiResponse = 'Thank you for your feedback! We appreciate your input and will use it to improve our service.';
    }

    // Save feedback to database
    const feedback = new Feedback({
      customerName,
      customerEmail,
      rating,
      comment,
      aiResponse
    });
    await feedback.save();

    console.log('Saved feedback to MongoDB');
    return res.json({ success: true, aiResponse, stored: 'mongodb' });
  } catch (err) {
    console.error('Error processing feedback', err);
    return res.status(500).json({ error: 'failed to process feedback' });
  }
});

// POST /api/chat
// Chatbot endpoint for customer assistance
app.post('/api/chat', async (req, res) => {
  const { message, conversationHistory = [] } = req.body;

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({ error: 'message is required and cannot be empty' });
  }

  try {
    let aiResponse = '';
    if (process.env.GOOGLE_AI_API_KEY) {
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      
      // Create context for restaurant chatbot
      const systemPrompt = `You are the Tasty Bites AI assistant. You help customers with:
      - Menu recommendations and descriptions
      - Order placement assistance
      - Delivery information
      - Restaurant hours and location
      - Payment methods (M-Pesa, cash, card)
      - General customer service inquiries
      
      Be friendly, professional, and concise. If you don't know something specific, offer to connect them with a human representative.
      
      Previous conversation:`;
      
      const conversationContext = conversationHistory.slice(-4).map(msg => 
        `${msg.role === 'user' ? 'Customer' : 'Assistant'}: ${msg.message}`
      ).join('\n');
      
      const prompt = `${systemPrompt}\n${conversationContext}\nCustomer: ${message}\nAssistant:`;
      
      const result = await model.generateContent(prompt);
      const response = await result.response;
      aiResponse = response.text().trim();
    } else {
      aiResponse = 'I apologize, but our AI assistant is currently unavailable. Please contact our support team directly.';
    }

    return res.json({ 
      success: true, 
      response: aiResponse,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('Error processing chat message', err);
    return res.status(500).json({ error: 'failed to process chat message' });
  }
});

// Admin endpoint to list orders
app.get('/api/admin/orders', async (req, res) => {
  const adminKey = req.headers['x-admin-key'];
  if (!process.env.ADMIN_KEY || adminKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  try {
    // Try to fetch from MongoDB
    const docs = await Order.find({}).sort({ createdAt: -1 }).limit(1000);
    return res.json({ source: 'mongodb', count: docs.length, orders: docs });
  } catch (dbErr) {
    console.error('Failed to fetch from MongoDB, falling back to file:', dbErr.message);
    // File fallback
    const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
    let existing = [];
    try {
      const content = await fs.readFile(ORDERS_FILE, 'utf8');
      existing = JSON.parse(content || '[]');
    } catch (e) {
      existing = [];
    }
    return res.json({ source: 'file', count: existing.length, orders: existing.reverse() });
  }
});

// Admin endpoint to list payments
// Protected by an ADMIN_KEY header for simplicity (set ADMIN_KEY in .env)
app.get('/api/admin/payments', async (req, res) => {
  const adminKey = req.headers['x-admin-key'];
  if (!process.env.ADMIN_KEY || adminKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  try {
    if (paymentsCollection) {
      const docs = await paymentsCollection.find({}).sort({ receivedAt: -1 }).limit(1000).toArray();
      return res.json({ source: 'mongodb', count: docs.length, payments: docs });
    }

    // File fallback
    let existing = [];
    try {
      const content = await fs.readFile(PAYMENTS_FILE, 'utf8');
      existing = JSON.parse(content || '[]');
    } catch (e) {
      existing = [];
    }

    return res.json({ source: 'file', count: existing.length, payments: existing.reverse() });
  } catch (err) {
    console.error('Error fetching payments', err);
    return res.status(500).json({ error: 'failed to fetch payments' });
  }
});

// Admin endpoint to list feedbacks
app.get('/api/admin/feedbacks', async (req, res) => {
  const adminKey = req.headers['x-admin-key'];
  if (!process.env.ADMIN_KEY || adminKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  try {
    const docs = await Feedback.find({}).sort({ createdAt: -1 }).limit(1000);
    return res.json({ source: 'mongodb', count: docs.length, feedbacks: docs });
  } catch (dbErr) {
    console.error('Failed to fetch feedbacks:', dbErr.message);
    return res.status(500).json({ error: 'failed to fetch feedbacks' });
  }
});

app.listen(PORT, () => console.log(`Server listening on ${PORT}`));
