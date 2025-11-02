document.addEventListener('DOMContentLoaded', () => {
    // --- 1. DOM Element Selectors ---
    const chatForm = document.getElementById('chat-form');
    const messageInput = document.getElementById('message-input');
    const sendButton = document.getElementById('send-button');
    const chatMessages = document.getElementById('chat-messages');
    const langSelector = document.getElementById('lang-selector');
    const micButton = document.getElementById('mic-button'); // New

    // --- 2. API URLs (for Solution 1: Local Demo) ---
    const API_URL_CHAT = 'http://127.0.0.1:8000/chat';
    const API_URL_TRANSLATE = 'http://127.0.0.1:8000/translate';

    // --- 3. Speech Recognition (Speech-to-Text) Setup ---
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognition;

    if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        micButton.addEventListener('click', () => {
            try {
                // Set language based on dropdown
                recognition.lang = langSelector.value === 'EN-US' ? 'en-US' : 'mr-IN';
                recognition.start();
                micButton.classList.add('is-recording');
                micButton.querySelector('i').className = "fas fa-stop";
            } catch (e) {
                console.error("Speech recognition error starting:", e);
            }
        });

        recognition.onresult = (event) => {
            const speechResult = event.results[0][0].transcript;
            messageInput.value = speechResult;
            // Automatically submit the form with the recognized text
            chatForm.requestSubmit();
        };

        recognition.onend = () => {
            micButton.classList.remove('is-recording');
            micButton.querySelector('i').className = "fas fa-microphone";
        };

        recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            alert("Error in speech recognition: " + event.error);
            micButton.classList.remove('is-recording');
            micButton.querySelector('i').className = "fas fa-microphone";
        };

    } else {
        console.warn("Speech Recognition not supported. Hiding mic button.");
        micButton.style.display = 'none'; // Hide if not supported
    }

    // --- 4. Speech Synthesis (Text-to-Speech) Setup ---
    chatMessages.addEventListener('click', (e) => {
        const speakButton = e.target.closest('.speak-button');
        if (speakButton) {
            const textToSpeak = speakButton.parentElement.querySelector('p').textContent;
            const utterance = new SpeechSynthesisUtterance(textToSpeak);
            
            // Set language based on dropdown
            utterance.lang = langSelector.value === 'EN-US' ? 'en-US' : 'mr-IN';
            
            // Fix for browsers that don't load voices immediately
            const voices = window.speechSynthesis.getVoices();
            let marathiVoice = voices.find(voice => voice.lang === 'mr-IN');
            if (utterance.lang === 'mr-IN' && marathiVoice) {
                utterance.voice = marathiVoice;
            }

            window.speechSynthesis.cancel(); // Stop any previous speech
            window.speechSynthesis.speak(utterance);
        }
    });


    // --- 5. Main Chat Form Logic ---
    chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const message = messageInput.value.trim();
        if (!message) return;

        const targetLang = langSelector.value;
        
        appendMessage(message, 'user');
        messageInput.value = "";
        toggleInput(true);

        const botMessageElement = createBotMessageElement();
        chatMessages.appendChild(botMessageElement);
        scrollToBottom();

        let queryToSend = message;
        
        try {
            // --- Step 1: Translate query (if not English) ---
            if (targetLang !== 'EN-US') {
                queryToSend = await translateText(message, 'EN-US', targetLang);
            }

            // --- Step 2: Send (English) query to the Chatbot ---
            const response = await fetch(API_URL_CHAT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: queryToSend }),
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let fullResponse = "";
            let currentSentence = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n\n');
                
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const content = line.substring(6);
                        if (content) {
                            if (targetLang === 'EN-US') {
                                fullResponse += content;
                                botMessageElement.querySelector('p').textContent = fullResponse;
                            } else {
                                currentSentence += content;
                                if (content.includes('.') || content.includes('!') || content.includes('?')) {
                                    const translatedSentence = await translateText(currentSentence, targetLang, 'EN-US');
                                    fullResponse += translatedSentence;
                                    botMessageElement.querySelector('p').textContent = fullResponse;
                                    currentSentence = ""; 
                                }
                            }
                            scrollToBottom();
                        }
                    }
                }
            }

            // --- Step 3: Translate any remaining text ---
            if (targetLang !== 'EN-US' && currentSentence.trim() !== "") {
                const translatedSentence = await translateText(currentSentence, targetLang, 'EN-US');
                fullResponse += translatedSentence;
                botMessageElement.querySelector('p').textContent = fullResponse;
                scrollToBottom();
            }

        } catch (error) {
            console.error('Error in chat/translation pipeline:', error);
            botMessageElement.querySelector('p').textContent = 'Sorry, I encountered an error. Please try again later.';
        } finally {
            toggleInput(false);
            messageInput.focus();
            // Show the speak button
            const speakBtn = botMessageElement.querySelector('.speak-button');
            if (speakBtn) speakBtn.style.display = 'inline-block';
        }
    });

    // --- 6. Helper Functions ---
    async function translateText(text, targetLang, sourceLang = "auto") {
        try {
            const response = await fetch(API_URL_TRANSLATE, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: text,
                    target_lang: targetLang,
                    source_lang: sourceLang
                })
            });
            const data = await response.json();
            if (data.error) {
                throw new Error(data.error);
            }
            return data.translated_text;
        } catch (error) {
            console.error('Translation Error:', error);
            return text; // Fallback to original text on error
        }
    }

    function toggleInput(disabled) {
        messageInput.disabled = disabled;
        sendButton.disabled = disabled;
        micButton.disabled = disabled;
    }

    function appendMessage(text, sender) {
        const messageElement = document.createElement('div');
        messageElement.classList.add('message', `${sender}-message`);
        const p = document.createElement('p');
        p.textContent = text;
        messageElement.appendChild(p);
        chatMessages.appendChild(messageElement);
        scrollToBottom();
    }

    function createBotMessageElement() {
        const messageElement = document.createElement('div');
        messageElement.classList.add('message', 'bot-message');
        
        const p = document.createElement('p');
        p.innerHTML = '<span class="typing-indicator"></span>';
        
        const speakButton = document.createElement('button');
        speakButton.className = 'speak-button';
        speakButton.setAttribute('aria-label', 'Read message aloud');
        speakButton.innerHTML = '<i class="fas fa-volume-up"></i>';
        
        messageElement.appendChild(p);
        messageElement.appendChild(speakButton);
        return messageElement;
    }

    function scrollToBottom() {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
});