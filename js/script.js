// Cart functionality
class Cart {
    constructor() {
        this.items = JSON.parse(localStorage.getItem('cart')) || [];
        this.updateCartCount();
    }

    addItem(id, name, price, quantity = 1) {
        const existingItem = this.items.find(item => item.id === id);
        
        if (existingItem) {
            existingItem.quantity += quantity;
        } else {
            this.items.push({ id, name, price, quantity });
        }
        
        this.saveCart();
        this.updateCartCount();
        this.showNotification(`${name} added to cart!`);
    }

    removeItem(id) {
        this.items = this.items.filter(item => item.id !== id);
        this.saveCart();
        this.updateCartCount();
    }

    updateQuantity(id, quantity) {
        const item = this.items.find(item => item.id === id);
        if (item) {
            if (quantity <= 0) {
                this.removeItem(id);
            } else {
                item.quantity = quantity;
            }
            this.saveCart();
            this.updateCartCount();
        }
    }

    getTotal() {
        return this.items.reduce((total, item) => total + (item.price * item.quantity), 0);
    }

    clear() {
        this.items = [];
        this.saveCart();
        this.updateCartCount();
    }

    saveCart() {
        localStorage.setItem('cart', JSON.stringify(this.items));
    }

    updateCartCount() {
        const count = this.items.reduce((total, item) => total + item.quantity, 0);
        document.querySelectorAll('#cart-count').forEach(el => {
            el.textContent = count;
        });
    }

    showNotification(message) {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #4ecdc4;
            color: white;
            padding: 1rem 2rem;
            border-radius: 5px;
            z-index: 1000;
            animation: slideIn 0.3s ease;
        `;
        notification.textContent = message;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }
}

// Initialize cart
const cart = new Cart();

// DOM Content Loaded
document.addEventListener('DOMContentLoaded', function() {
    // Add to cart buttons
    document.querySelectorAll('.add-to-cart').forEach(button => {
        button.addEventListener('click', function() {
            const id = this.dataset.id;
            const name = this.dataset.name;
            const price = parseInt(this.dataset.price);
            
            cart.addItem(id, name, price);
        });
    });

    // Cart page functionality
    if (document.querySelector('#cart-table')) {
        renderCartPage();
    }

    // Payment page functionality
    if (document.querySelector('#pay-with-mpesa')) {
        renderPaymentPage();
        setupPaymentForm();
    }

    // Menu filtering
    setupMenuFiltering();
});

// Render cart page
function renderCartPage() {
    const cartItemsBody = document.querySelector('#cart-items-body');
    const cartEmpty = document.querySelector('#cart-empty');
    const cartTable = document.querySelector('#cart-table');
    const subtotalEl = document.querySelector('#subtotal');
    const totalEl = document.querySelector('#total');
    const checkoutBtn = document.querySelector('#checkout-btn');

    if (cart.items.length === 0) {
        cartEmpty.style.display = 'block';
        cartTable.style.display = 'none';
        checkoutBtn.disabled = true;
    } else {
        cartEmpty.style.display = 'none';
        cartTable.style.display = 'table';
        checkoutBtn.disabled = false;

        cartItemsBody.innerHTML = '';
        cart.items.forEach(item => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${item.name}</td>
                <td>Ksh ${item.price}</td>
                <td>
                    <div class="quantity-control">
                        <button class="quantity-btn minus" data-id="${item.id}">-</button>
                        <span>${item.quantity}</span>
                        <button class="quantity-btn plus" data-id="${item.id}">+</button>
                    </div>
                </td>
                <td>Ksh ${item.price * item.quantity}</td>
                <td>
                    <button class="remove-item" data-id="${item.id}">Remove</button>
                </td>
            `;
            cartItemsBody.appendChild(row);
        });

        // Add event listeners for quantity controls
        document.querySelectorAll('.quantity-btn.minus').forEach(btn => {
            btn.addEventListener('click', function() {
                const id = this.dataset.id;
                const item = cart.items.find(item => item.id === id);
                if (item) {
                    cart.updateQuantity(id, item.quantity - 1);
                    renderCartPage();
                }
            });
        });

        document.querySelectorAll('.quantity-btn.plus').forEach(btn => {
            btn.addEventListener('click', function() {
                const id = this.dataset.id;
                const item = cart.items.find(item => item.id === id);
                if (item) {
                    cart.updateQuantity(id, item.quantity + 1);
                    renderCartPage();
                }
            });
        });

        document.querySelectorAll('.remove-item').forEach(btn => {
            btn.addEventListener('click', function() {
                const id = this.dataset.id;
                cart.removeItem(id);
                renderCartPage();
            });
        });

        // Update totals
        const subtotal = cart.getTotal();
        const delivery = 150;
        const total = subtotal + delivery;

        subtotalEl.textContent = `Ksh ${subtotal}`;
        totalEl.textContent = `Ksh ${total}`;

        // Checkout button
        checkoutBtn.addEventListener('click', function() {
            localStorage.setItem('orderTotal', total);
            window.location.href = 'payment.html';
        });
    }
}

// Render payment page
function renderPaymentPage() {
    const orderItemsEl = document.querySelector('#payment-order-items');
    const subtotalEl = document.querySelector('#payment-subtotal');
    const totalEl = document.querySelector('#payment-total');
    const amountInput = document.querySelector('#amount');

    if (cart.items.length === 0) {
        orderItemsEl.innerHTML = '<p>No items in cart</p>';
        window.location.href = 'cart.html';
        return;
    }

    let itemsHtml = '';
    cart.items.forEach(item => {
        itemsHtml += `
            <div class="order-item">
                <span>${item.name} x ${item.quantity}</span>
                <span>Ksh ${item.price * item.quantity}</span>
            </div>
        `;
    });

    orderItemsEl.innerHTML = itemsHtml;

    const subtotal = cart.getTotal();
    const delivery = 150;
    const total = subtotal + delivery;

    subtotalEl.textContent = `Ksh ${subtotal}`;
    totalEl.textContent = `Ksh ${total}`;
    amountInput.value = total;
}

// Setup payment form
function setupPaymentForm() {
    const payBtn = document.querySelector('#pay-with-mpesa');
    const phoneInput = document.querySelector('#phone');
    const paymentSuccess = document.querySelector('#payment-success');
    const amountInput = document.querySelector('#amount');

    // Format phone number
    phoneInput.addEventListener('input', function() {
        let value = this.value.replace(/\D/g, '');
        if (value.length > 0) {
            if (value.startsWith('0')) {
                value = value.substring(1);
            }
            if (value.length > 9) {
                value = value.substring(0, 9);
            }
            this.value = value;
        }
    });

    // M-Pesa payment simulation
    payBtn.addEventListener('click', async function() {
        const phone = phoneInput.value;
        
        if (!phone || phone.length !== 9) {
            alert('Please enter a valid 10-digit phone number (without 0 at beginning)');
            return;
        }

        // Show loading
        payBtn.textContent = 'Processing...';
        payBtn.disabled = true;

        try {
            // First, save the order to database
            const orderData = {
                items: cart.items.map(item => ({
                    id: item.id,
                    name: item.name,
                    price: item.price,
                    quantity: item.quantity,
                    total: item.price * item.quantity
                })),
                customerPhone: phone,
                totalAmount: parseInt(amountInput.value),
                paymentMethod: 'mpesa'
            };

            const orderResponse = await fetch('/api/orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(orderData)
            });

            const orderResult = await orderResponse.json();
            
            if (!orderResult.success) {
                throw new Error('Failed to save order: ' + (orderResult.error || 'Unknown error'));
            }

            console.log('Order saved:', orderResult.orderId);

            // Then initiate payment
            const paymentResponse = await fetch('/api/mpesa/stk-push', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone: phone, amount: parseInt(amountInput.value) })
            });

            const paymentData = await paymentResponse.json();

            if (paymentData.simulated) {
                alert('STK Push simulated. Check console for details.');
                console.log('Simulated STK response:', paymentData);
                showPaymentSuccess(orderResult.orderId);
            } else if (paymentData.data || paymentData.ResultCode === 0 || (paymentData.data && paymentData.data.ResponseCode === '0')) {
                // STK push initiated
                alert('STK Push initiated. Check your phone for the prompt.');
                console.log('STK response:', paymentData);
                showPaymentSuccess(orderResult.orderId);
            } else {
                console.error('Unexpected payment response', paymentData);
                alert('Payment failed to start. See console for details.');
            }
        } catch (err) {
            console.error('Payment/Order process failed', err);
            alert('Payment/Order process failed. See console for details.');
        } finally {
            payBtn.textContent = 'Pay with M-Pesa';
            payBtn.disabled = false;
        }
    });
}

// Show payment success modal with order ID
function showPaymentSuccess(orderId) {
    const paymentSuccess = document.querySelector('#payment-success');
    const orderIdElement = paymentSuccess.querySelector('#order-id-display');
    
    // Update the order ID in the modal
    if (orderIdElement) {
        orderIdElement.textContent = orderId;
    }
    
    paymentSuccess.style.display = 'flex';
    
    // Clear cart and UI
    cart.clear();
    cart.updateCartCount();
}

// Menu filtering
function setupMenuFiltering() {
    const categoryBtns = document.querySelectorAll('.category-btn');
    const menuItems = document.querySelectorAll('.menu-item');

    categoryBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            // Update active button
            categoryBtns.forEach(b => b.classList.remove('active'));
            this.classList.add('active');

            const category = this.dataset.category;

            // Filter items
            menuItems.forEach(item => {
                if (category === 'all' || item.dataset.category === category) {
                    item.style.display = 'block';
                } else {
                    item.style.display = 'none';
                }
            });
        });
    });
}

// Update cart count on all pages
function updateCartCountOnAllPages() {
    const count = cart.items.reduce((total, item) => total + item.quantity, 0);
    document.querySelectorAll('#cart-count').forEach(el => {
        el.textContent = count;
    });
}

// Initialize cart count on page load
updateCartCountOnAllPages();

// Feedback form handler
const feedbackForm = document.getElementById('feedback-form');
if (feedbackForm) {
    feedbackForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const formData = new FormData(feedbackForm);
        const data = {
            customerName: formData.get('customerName'),
            customerEmail: formData.get('customerEmail'),
            rating: parseInt(formData.get('rating')),
            comment: formData.get('comment')
        };
        
        const responseDiv = document.getElementById('feedback-response');
        responseDiv.textContent = 'Submitting feedback...';
        responseDiv.style.color = '#007bff';
        
        try {
            const response = await fetch('/api/feedback', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });
            
            const result = await response.json();
            
            if (result.success) {
                responseDiv.textContent = `Thank you for your feedback! ${result.aiResponse}`;
                responseDiv.style.color = '#28a745';
                feedbackForm.reset();
            } else {
                responseDiv.textContent = 'Error submitting feedback. Please try again.';
                responseDiv.style.color = '#dc3545';
            }
        } catch (error) {
            console.error('Error:', error);
            responseDiv.textContent = 'Error submitting feedback. Please try again.';
            responseDiv.style.color = '#dc3545';
        }
    });
}

// Chat Widget Functionality
class ChatWidget {
    constructor(config) {
        this.config = config;
        this.conversationHistory = [];
        this.isOpen = false;
        this.init();
    }

    init() {
        this.chatButton = document.getElementById(this.config.buttonId);
        this.chatModal = document.getElementById(this.config.modalId);
        this.chatClose = document.getElementById(this.config.closeId);
        this.chatInput = document.getElementById(this.config.inputId);
        this.chatSend = document.getElementById(this.config.sendId);
        this.chatMessages = document.getElementById(this.config.messagesId);

        this.bindEvents();
        this.addWelcomeMessage();
    }

    bindEvents() {
        this.chatButton.addEventListener('click', () => this.toggleChat());
        this.chatClose.addEventListener('click', () => this.closeChat());
        this.chatSend.addEventListener('click', () => this.sendMessage());
        this.chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendMessage();
            }
        });
    }

    toggleChat() {
        this.isOpen = !this.isOpen;
        if (this.isOpen) {
            this.openChat();
        } else {
            this.closeChat();
        }
    }

    openChat() {
        this.chatModal.classList.remove('chat-hidden');
        this.chatInput.focus();
    }

    closeChat() {
        this.chatModal.classList.add('chat-hidden');
        this.isOpen = false;
    }

    addWelcomeMessage() {
        const welcomeMessage = this.config.welcomeMessage;
        this.addMessage(welcomeMessage, 'bot');
    }

    addMessage(message, type) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `chat-message ${type}`;
        messageDiv.textContent = message;
        this.chatMessages.appendChild(messageDiv);
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }

    async sendMessage() {
        const message = this.chatInput.value.trim();
        if (!message) return;

        // Add user message
        this.addMessage(message, 'user');
        this.chatInput.value = '';

        // Disable input while processing
        this.chatSend.disabled = true;
        this.chatInput.disabled = true;

        // Add to conversation history
        this.conversationHistory.push({ role: 'user', message });

        try {
            if (this.config.type === 'google') {
                // Use Google AI via backend
                const response = await fetch('/api/chat', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        message,
                        conversationHistory: this.conversationHistory
                    })
                });

                const result = await response.json();

                if (result.success) {
                    this.addMessage(result.response, 'bot');
                    this.conversationHistory.push({ role: 'assistant', message: result.response });
                } else {
                    this.addMessage('Sorry, I encountered an error. Please try again.', 'bot');
                }
            } else if (this.config.type === 'puter') {
                // Use Puter.ai directly
                const prompt = `${this.config.systemPrompt}\n${this.conversationHistory.slice(-4).map(msg => 
                    `${msg.role === 'user' ? 'Customer' : 'Assistant'}: ${msg.message}`
                ).join('\n')}\nCustomer: ${message}\nAssistant:`;

                const response = await puter.ai.chat(prompt, { model: "gpt-4o-mini" });
                
                this.addMessage(response, 'bot');
                this.conversationHistory.push({ role: 'assistant', message: response });
            }
        } catch (error) {
            console.error('Chat error:', error);
            this.addMessage('Sorry, I\'m having trouble connecting. Please try again later.', 'bot');
        }

        // Re-enable input
        this.chatSend.disabled = false;
        this.chatInput.disabled = false;
        this.chatInput.focus();
    }
}

// Initialize both chat widgets when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Google AI Chatbot (Right side)
    new ChatWidget({
        type: 'google',
        buttonId: 'chat-button-google',
        modalId: 'chat-modal-google',
        closeId: 'chat-close-google',
        inputId: 'chat-input-google',
        sendId: 'chat-send-google',
        messagesId: 'chat-messages-google',
        welcomeMessage: "👋 Hi! I'm your Tasty Bites AI assistant. I can help you with menu recommendations, order questions, delivery info, and more. How can I assist you today?",
        systemPrompt: `You are a helpful restaurant assistant for Tasty Bites restaurant. You help customers with:
        - Menu recommendations and descriptions
        - Order placement assistance
        - Delivery information
        - Restaurant hours and location
        - Payment methods (M-Pesa, cash, card)
        - General customer service inquiries
        
        Be friendly, professional, and concise. If you don't know something specific, offer to connect them with a human representative.`
    });

    // Puter.ai Chatbot (Left side)
    new ChatWidget({
        type: 'puter',
        buttonId: 'chat-button-puter',
        modalId: 'chat-modal-puter',
        closeId: 'chat-close-puter',
        inputId: 'chat-input-puter',
        sendId: 'chat-send-puter',
        messagesId: 'chat-messages-puter',
        welcomeMessage: "🧠 Hi! I'm your Puter.ai assistant. I'm here to help with any questions you might have. What can I help you with today?",
        systemPrompt: `You are a helpful AI assistant. You can help with any questions or topics the user has. Be friendly, informative, and engaging.`
    });
});
