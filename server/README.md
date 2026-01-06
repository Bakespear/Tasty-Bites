Tasty Bites - MPesa Server

This small Express server exposes an endpoint to perform an M-Pesa STK Push. It supports:
- Simulation mode when Daraja credentials are not set (useful for local dev)
- Real Daraja STK Push when `DARAJA_CONSUMER_KEY` and `DARAJA_CONSUMER_SECRET` are provided

Quick start:

1. cd server
2. npm install
3. Copy `.env.example` to `.env` and set your credentials (or leave empty to simulate)
4. npm run dev

Endpoint:
POST /api/mpesa/stk-push
Body: { phone: '7XXXXXXXX', amount: 1000 }

Returns a JSON object with either `simulated: true` or the Daraja response.

Callback (payment confirmation)
--------------------------------
Daraja will POST payment confirmations to your `DARAJA_CALLBACK_URL`. For local testing you can use ngrok to expose your local server:

1. Start the server: `npm run dev`
2. Run ngrok: `ngrok http 3000`
3. Copy the generated HTTPS URL and set `DARAJA_CALLBACK_URL` in your `.env` (e.g. `https://abcd1234.ngrok.io/api/mpesa/callback`)

The server exposes `POST /api/mpesa/callback` which will persist callback payloads to `server/data/payments.json`.

MongoDB option
---------------
If you set `MONGO_URI` in your `.env`, the server will attempt to connect to MongoDB and store payment callback records in the `payments` collection of the specified database. If the Mongo connection fails or `MONGO_URI` is not set, the server falls back to saving callbacks into `server/data/payments.json`.

To run with Mongo locally, you can use a local Mongo or Docker:

docker run -d -p 27017:27017 --name tasty-mongo mongo:6
Set `MONGO_URI=mongodb://localhost:27017` and restart the server.

Admin endpoint
--------------
The server exposes a simple admin endpoint to list stored payments:

GET /api/admin/payments
Requires header: `x-admin-key: <ADMIN_KEY>` (set `ADMIN_KEY` in `.env`).

Example:
curl -H "x-admin-key: changeme_to_secure_value" http://localhost:3000/api/admin/payments

