document.addEventListener('DOMContentLoaded', () => {
    // --- 1. DOM Element Selectors ---
    const chatForm = document.getElementById('chat-form');
    const messageInput = document.getElementById('message-input');
    const sendButton = document.getElementById('send-button');
    const chatMessages = document.getElementById('chat-messages');
    const langSelector = document.getElementById('lang-selector');
    const micButton = document.getElementById('mic-button'); 

    // --- 2. API URLs (for Local Demo) ---
    const API_URL_CHAT = ' https://feetless-kecia-plantable.ngrok-free.dev/chat';
    const API_URL_TRANSLATE = ' https://feetless-kecia-plantable.ngrok-free.dev/translate'; // <-- This now works!

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
                recognition.lang = langSelector.value; // 'en-US' or 'mr-IN'
                recognition.start();
                micButton.classList.add('is-recording');
                micButton.querySelector('i').className = "fas fa-stop";
            } catch (e) {
                console.error("Speech recognition error starting:", e);
                alert("Could not start voice recognition. Is your microphone enabled?");
            }
        });

        recognition.onresult = (event) => {
            const speechResult = event.results[0][0].transcript;
            messageInput.value = speechResult;
            chatForm.requestSubmit();
        };

        recognition.onend = () => {
            micButton.classList.remove('is-recording');
            micButton.querySelector('i').className = "fas fa-microphone";
        };

        recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            micButton.classList.remove('is-recording');
            micButton.querySelector('i').className = "fas fa-microphone";
        };

    } else {
        console.warn("Speech Recognition not supported. Hiding mic button.");
        micButton.style.display = 'none'; 
    }

    // --- 4. Speech Synthesis (Text-to-Speech) Setup ---
    // We need to load voices async, as they are not always ready
    let voices = [];
    function loadVoices() {
        voices = window.speechSynthesis.getVoices();
    }
    loadVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = loadVoices;
    }

    chatMessages.addEventListener('click', (e) => {
        const speakButton = e.target.closest('.speak-button');
        if (speakButton) {
            const textToSpeak = speakButton.parentElement.querySelector('p').textContent;
            const utterance = new SpeechSynthesisUtterance(textToSpeak);
            
            const selectedLang = langSelector.value; // 'en-US' or 'mr-IN'
            utterance.lang = selectedLang;
            
            // This is the fix for the "bugged voice". 
            // We must find the specific voice for the language.
            const matchingVoice = voices.find(voice => voice.lang === selectedLang);
            if (matchingVoice) {
                utterance.voice = matchingVoice;
            } else {
                 console.warn(`No voice found for ${selectedLang}, using default.`);
            }

            window.speechSynthesis.cancel(); 
            window.speechSynthesis.speak(utterance);
        }
    });


    // --- 5. Main Chat Form Logic ---
    chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const message = messageInput.value.trim();
        if (!message) return;

        const targetLang = langSelector.value; 
        const sourceLang = targetLang === 'en-US' ? 'en' : 'mr';
        
        appendMessage(message, 'user');
        messageInput.value = "";
        toggleInput(true);

        const botMessageElement = createBotMessageElement();
        chatMessages.appendChild(botMessageElement);
        scrollToBottom();

        let queryToSend = message;
        
        try {
            // --- Step 1: Translate query (if not English) ---
            if (targetLang !== 'en-US') {
                queryToSend = await translateText(message, 'en', 'mr');
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
            let fullResponse = ""; // Accumulate the full English response

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n\n');
                
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const content = line.substring(6);
                        if (content) {
                            fullResponse += content;
                        }
                    }
                }
                // Don't update UI until translation is done
                scrollToBottom();
            }

            // --- Step 3: Translate the final response (if not English) ---
            let finalResponse = fullResponse;
            if (targetLang !== 'en-US') {
                finalResponse = await translateText(fullResponse, 'mr', 'en');
            }
            
            // --- Step 4: Display the final, translated response ---
            botMessageElement.querySelector('p').textContent = finalResponse;

        } catch (error) {
            console.error('Error in chat/translation pipeline:', error);
            botMessageElement.querySelector('p').textContent = 'Sorry, I encountered an error. Please try again later.';
        } finally {
            toggleInput(false);
            messageInput.focus();
            const speakBtn = botMessageElement.querySelector('.speak-button');
            if (speakBtn) speakBtn.style.display = 'inline-block';
        }
    });

    // --- 6. Helper Functions ---
    
    /**
     * NEW: Calls our *own* backend for translation
     */
    async function translateText(text, targetLang, sourceLang = "auto") {
        if (!text) return "";
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
        
        if (sender === 'user') {
            messageElement.appendChild(p);
        } else {
            return; 
        }
        
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
