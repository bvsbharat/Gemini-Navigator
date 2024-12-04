// =============================================================================
// CONFIGURATION AND CONSTANTS
// =============================================================================
let session;

// Speech recognition configuration
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;

// State management variables
let isSpeaking = false;
let isListening = false;

// =============================================================================
// TEXT ACCUMULATION AND PROCESSING
// =============================================================================


async function initDefaults() {
    if (!('aiOriginTrial' in chrome)) {
        showResponse('Error: chrome.aiOriginTrial not supported in this browser');
        return;
    }
    const defaults = await chrome.aiOriginTrial.languageModel.capabilities();
    console.log('Model default:', defaults);
    if (defaults.available !== 'readily') {
        showResponse(
            `Model not yet available (current state: "${defaults.available}")`
        );
        return;
    }
    sliderTemperature.value = defaults.defaultTemperature;
    // Pending https://issues.chromium.org/issues/367771112.
    // sliderTemperature.max = defaults.maxTemperature;
    if (defaults.defaultTopK > 3) {
        // limit default topK to 3
        sliderTopK.value = 3;
        labelTopK.textContent = 3;
    } else {
        sliderTopK.value = defaults.defaultTopK;
        labelTopK.textContent = defaults.defaultTopK;
    }
    sliderTopK.max = defaults.maxTopK;
    labelTemperature.textContent = defaults.defaultTemperature;
}

initDefaults().catch((error) => {
    console.error('Error initializing defaults:', error);
});

/**
 * Manages text accumulation for speech synthesis
 * Buffers text until it reaches a minimum length for better speech output
 */
function accumulateTextForSpeech(text) {
    const minChunkLength = 50; // Minimum characters before speaking
    let buffer = "";

    return {
        add: (newText) => {
            buffer += newText;
            if (buffer.length >= minChunkLength) {
                const chunk = buffer;
                buffer = "";
                return chunk;
            }
            return null;
        },
        flush: () => {
            if (buffer.length > 0) {
                const chunk = buffer;
                buffer = "";
                return chunk;
            }
            return null;
        },
    };
}

// =============================================================================
// UI COMPONENTS AND RENDERING
// =============================================================================

/**
 * Creates and updates the chat input container HTML
 * @returns {string} HTML string for the chat input container
 */
function updateChatInputContainer() {
    const inputContainer = `
    <div class="chat-input-container">
      <div class="input-wrapper">
        <textarea class="chat-input" placeholder="Ask a question..."></textarea>
        <button class="voice-toggle" title="Toggle voice output">
          <svg class="voice-icon" viewBox="0 0 24 24">
            <path d="M12,2A3,3 0 0,1 15,5V11A3,3 0 0,1 12,14A3,3 0 0,1 9,11V5A3,3 0 0,1 12,2M19,11C19,14.53 16.39,17.44 13,17.93V21H11V17.93C7.61,17.44 5,14.53 5,11H7A5,5 0 0,0 12,16A5,5 0 0,0 17,11H19Z"/>
          </svg>
        </button>
        <button class="enter-button" title="Press Enter to send">
       <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="-ml-px"><polyline points="9 10 4 15 9 20"></polyline><path d="M20 4v7a4 4 0 0 1-4 4H4"></path></svg>
        </button>
      </div>
    </div>
  `;
    return inputContainer;
}

/**
 * Updates the voice icon state based on activity
 * @param {boolean} isActive - Whether voice features are active
 */
function updateVoiceIcon(isActive) {
    const voiceToggle = shadow.querySelector(".voice-toggle");
    if (isActive) {
        voiceToggle.classList.add("active");
    } else {
        voiceToggle.classList.remove("active");
    }
}

// =============================================================================
// API INTERACTION AND LOGIC
// =============================================================================




async function runPrompt(prompt, params) {
    try {
        if (!self.ai || !self.ai.languageModel) {
            throw new Error('Prompt API is not available. Make sure you have joined the Chrome Early Preview Program.');
        }

        if (!session) {
            session = await self.ai.languageModel.create({
                temperature: params?.temperature || 0.7,
                topK: params?.topK || 40
            });
        }
        // Return the streaming response directly without awaiting
        return session.prompt(prompt);
    } catch (e) {
        console.log('Prompt failed');
        console.error(e);
        console.log('Prompt:', prompt);
        // Reset session
        if (session) {
            try {
                session.destroy();
            } catch (destroyError) {
                console.error('Error destroying session:', destroyError);
            }
        }
        session = null;
        throw e;
    }
}

async function reset() {
    if (session) {
        session.destroy();
    }
    session = null;
}

/**
 * Handles communication with the Google's implementation and processes the response
 * @param {string} text - The user's input text
 * @param {string} domContent - The context from the current page
 */
async function getLogic(text, domContent) {
    try {
        const params = {
            temperature: 0.7,
            topK: 40,
        };

        const prompt = `Context from current webpage: ${domContent}\n\nUser: ${text}`;
        const response = await runPrompt(prompt, params);

        return response;
    } catch (error) {
        console.error('Error in getLogic:', error);
        throw error;
    }
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Checks if an element is editable (input, textarea, or contenteditable)
 * @param {HTMLElement} element - The element to check
 * @returns {boolean} Whether the element is editable
 */
function isEditableElement(element) {
    if (!element) return false;

    return (
        element.isContentEditable ||
        element.tagName === "TEXTAREA" ||
        element.tagName === "INPUT" ||
        element.getAttribute("role") === "textbox" ||
        element.getAttribute("contenteditable") === "true"
    );
}

// =============================================================================
// EVENT LISTENERS AND MESSAGE HANDLING
// =============================================================================

// Chrome extension message listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "logInnerHTML") {
        console.log(document.body.innerText);
        sendResponse({ status: "success" });
        const innerText = document.body.innerText;
        getLogic(innerText)
            .then((result) => {
                // Send the processed result to the popup script to save in history
                chrome.runtime.sendMessage({
                    action: "saveToHistory",
                    summary: result,
                });
                console.log(result, "result");
            })
            .catch((error) => {
                console.error("Error processing text:", error);
            });
    }

    if (request.action === "InlineAI") {
        console.log("InlineAI");
        const handleAutofill = async () => {
            const activeElement = document.activeElement;
            if (isEditableElement(activeElement)) {
                const cursorPosition = activeElement.selectionStart;
                const textBeforeCursor = (
                    activeElement.value || activeElement.textContent
                ).substring(0, cursorPosition);

                const domContent = document.body.innerText;
                console.log("Using innerText:", domContent);
                console.log("Text before cursor:", textBeforeCursor);

                try {
                    await getLogic(textBeforeCursor, domContent);
                    sendResponse({ status: "success" });
                } catch (error) {
                    console.error("Error getting completion:", error);
                    sendResponse({ status: "error", message: error.message });
                }
            }
        };

        handleAutofill().catch(console.error);
        return true; // Indicates we'll send response asynchronously
    }
});

// =============================================================================
// SPEECH RECOGNITION AND VOICE FEATURES
// =============================================================================

/**
 * Initializes and configures speech recognition functionality
 */
function initializeSpeechRecognition() {
    if (!recognition && SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onresult = (event) => {
            const input = shadow.querySelector('.chat-input');
            if (!input) return;

            const transcript = Array.from(event.results)
                .map(result => result[0].transcript)
                .join('');
            input.value = transcript;

            // If this is a final result, trigger the chat
            if (event.results[0].isFinal) {
                // Add delay before stopping to prevent cutting off
                setTimeout(() => {
                    recognition.stop();
                    isListening = false;
                    updateVoiceIcon(false);

                    // Find and trigger the send button
                    const sendButton = shadow.querySelector('.chat-send-button');
                    if (sendButton) {
                        sendButton.click();
                    }
                }, 500);
            }
        };

        recognition.onend = () => {
            // Only restart if explicitly still listening
            if (isListening) {
                try {
                    recognition.start();
                } catch (error) {
                    console.warn('Failed to restart recognition:', error);
                    isListening = false;
                    updateVoiceIcon(false);
                }
            }
        };

        recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            switch (event.error) {
                case 'not-allowed':
                case 'service-not-allowed':
                    alert('Please enable microphone access to use voice input.');
                    break;
                case 'no-speech':
                    // Just restart if no speech detected
                    if (isListening) {
                        try {
                            recognition.start();
                        } catch (e) {
                            console.warn('Failed to restart after no-speech:', e);
                        }
                    }
                    break;
                default:
                    // For other errors, stop listening
                    isListening = false;
                    updateVoiceIcon(false);
            }
        };
    }
}

/**
 * Updates voice toggle button handler
 */
function updateVoiceToggleHandler() {
    const voiceToggle = shadow.querySelector('.voice-toggle');
    voiceToggle.addEventListener('click', () => {
        isSpeaking = !isSpeaking;

        if (SpeechRecognition) {
            if (!recognition) {
                initializeSpeechRecognition();
            }

            isListening = !isListening;
            if (isListening) {
                recognition.start();
            } else {
                recognition.stop();
            }
        } else {
            console.warn('Speech recognition not supported in this browser');
        }

        updateVoiceIcon(isSpeaking || isListening);
    });
}

// =============================================================================
// STYLES AND UI CONFIGURATION
// =============================================================================

// Additional styles for voice toggle animation
const additionalStyles = `
  .voice-toggle.active .voice-icon {
    animation: pulse 1.5s infinite;
  }

  @keyframes pulse {
    0% { opacity: 1; }
    50% { opacity: 0.5; }
    100% { opacity: 1; }
  }
`;

// Create chat interface
function createChatInterface() {
    // Check if interface already exists
    if (document.getElementById('ai-chat-extension-root')) {
        console.log('Chat interface already exists, skipping initialization');
        return;
    }

    // Create a shadow root container
    const container = document.createElement("div");
    container.id = "ai-chat-extension-root";
    shadow = container.attachShadow({ mode: "closed" });
    let sendButton = document.createElement("button");
    sendButton.className = "chat-send-button";

    // Inject styles directly into shadow DOM
    const styleSheet = document.createElement("style");
    fetch(chrome.runtime.getURL("styles.css"))
        .then(response => response.text())
        .then(css => {
            styleSheet.textContent = css;
        });
    shadow.appendChild(styleSheet);

    // Create chat elements inside shadow DOM
    const controlButton = document.createElement("button");
    controlButton.className = "chat-control-button";
    controlButton.innerHTML = `
    <div class="control-icon">
      <img src="${chrome.runtime.getURL(
        "images/App_icon.png"
    )}" alt="Gemini Navigator Logo" class="logo">
      <span>  Gemini Nav</span>
    </div>
  `;

    const chatWindow = document.createElement("div");
    chatWindow.className = "chat-window";
    chatWindow.innerHTML = `
    <div class="chat-header">
      <span> 
        <img src="${chrome.runtime.getURL("images/App_icon.png")}" alt="Gemini Navigator Logo" class="logo"> 
        Gemini Navigator
      </span>
      <button class="chat-close-button">×</button>
    </div>
    <div class="chat-messages">
      <div class="chat-message assistant-message initial-message">
        👋 Hi there!
        I'm your AI assistant. I'm here to help answer any questions you have about this page or any other topics. Feel free to ask anything!
      </div>
    </div>
    <div class="chat-input-container">
      <button class="voice-toggle" title="Toggle voice output">
        <svg class="voice-icon" viewBox="0 0 24 24">
          <path d="M12,2A3,3 0 0,1 15,5V11A3,3 0 0,1 12,14A3,3 0 0,1 9,11V5A3,3 0 0,1 12,2M19,11C19,14.53 16.39,17.44 13,17.93V21H11V17.93C7.61,17.44 5,14.53 5,11H7A5,5 0 0,0 12,16A5,5 0 0,0 17,11H19Z"/>
        </svg>
      </button>
      <textarea class="chat-input" placeholder="Ask a question..."></textarea>
      <button class="chat-send-button" title="Send message">
       <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="-ml-px"><polyline points="9 10 4 15 9 20"></polyline><path d="M20 4v7a4 4 0 0 1-4 4H4"></path></svg>
      </button>
    </div>
  `;

    chatWindow.style.display = "none";

    controlButton.addEventListener("click", () => {
        if (chatWindow.style.display === "none") {
            controlButton.classList.add("hidden");
            chatWindow.style.display = "block";
            setTimeout(() => {
                chatWindow.classList.add("show");
            }, 10);
        } else {
            chatWindow.classList.remove("show");
            setTimeout(() => {
                chatWindow.style.display = "none";
                controlButton.classList.remove("hidden");
            }, 300);
        }
    });

    // Update close button handler
    const closeButton = chatWindow.querySelector(".chat-close-button");
    closeButton.addEventListener("click", () => {
        chatWindow.classList.remove("show");
        setTimeout(() => {
            chatWindow.style.display = "none";
            controlButton.classList.remove("hidden");
        }, 300);
    });

    // Add chat functionality
    const chatInput = chatWindow.querySelector(".chat-input");
    const messagesContainer = chatWindow.querySelector(".chat-messages");

    async function handleChat() {
        const question = chatInput.value.trim();
        if (!question) return;

        // Disable input while processing
        chatInput.disabled = true;

        try {
            // show chat window
            if (chatWindow.style.display === "none") {
                controlButton.classList.add("hidden");
                chatWindow.style.display = "block";
                setTimeout(() => {
                    chatWindow.classList.add("show");
                }, 10);
            }

            // Remove previous highlights
            removeAllHighlights();

            // Add user message to chat
            appendMessage("user", question);
            chatInput.value = "";

            // Get page context
            const pageContext = document.body.innerText;

            // Process the response
            await streamChatResponse(question, pageContext, messagesContainer);

            await highlightRelevantContent(question, pageContext);

        } catch (error) {
            appendMessage(
                "error",
                "An error occurred while processing your request. Please try again."
            );
            console.error(error);
        } finally {
            // Re-enable input after processing
            chatInput.disabled = false;
        }
    }

    // get knowledge base
    async function getKnowledgeBase(question) {
        // Add thinking animation to the messages container
        const messagesContainer = shadow.querySelector('.chat-messages');
        const thinkingDiv = document.createElement('div');
        thinkingDiv.className = 'chat-message assistant-message thinking-animation';
        thinkingDiv.innerHTML = `
      <span class="thinking-text">Thinking</span>
      <div class="thinking-dots">
        <span></span>
        <span></span>
        <span></span>
      </div>
    `;
        messagesContainer.appendChild(thinkingDiv);

        try {
            const response = await fetch('http://localhost:3000/query', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ question }),
            });

            const data = await response.json();
            // Remove thinking animation
            thinkingDiv.remove();
            return data.answer || '';
        } catch (error) {
            console.log('Failed to fetch from knowledge base:', error);
            // Remove thinking animation on error
            thinkingDiv.remove();
            return '';
        }
    }

    async function streamChatResponse(question, contextWithLinks, messagesContainer) {
        const messageDiv = appendMessage("assistant", "");
        let completeResponse = "";
        let lastChunkLength = 0;

        try {
            const contactData = `IRS Tax Information:
                - Phone Numbers:
                - Tax questions: 1-800-829-1040 7 a.m. to 7 p.m. local time
                - Forms : 1-800-829-3676 7 a.m. to 7 p.m. local time
                - Email : 1-800-829-1040 and time 7 a.m. to 7 p.m. local time
                - Non-profit taxes:  1-877-829-5500 8 a.m. to 5 p.m. local time`;

            const knowledgeBase = await getKnowledgeBase(question);

            if (!session) {
                session = await self.ai.languageModel.create({
                    systemPrompt: `You are a helpful AI assistant for this IRS website. help in answering questions based on context data important context:${knowledgeBase} and current context: ${contextWithLinks} and free tax limit it 79,000.
                    - Help user with website content if they ask about it other wise just answer the question. in normal sentences.
                    - You are helpful and friendly ai assistant help them with their queries based on context data provided.
                    - if user asks about website content, use below format for response:
                    - use below format for response on website content:
                      Please provide a clear and structured response with:
                    - Proper formatting and emphasis
                    - Key points clearly highlighted
                    - Keep it under 250 words
                    - Use **bold** for emphasis
                    - Use *italic* for secondary emphasis
                    - Use \`code\` for technical terms
                    - Use bullet points for lists
                    - no need of ### in formating
                    - Use clear paragraph break
                    - Referencing links from the page, use this format: [link text](URL)
                    - Response should be in max 500 words
                    Important: show this information in your response always:
                     Contact info: 
                    - Use this data for phone number: ${contactData}
                    - Use this data for provinding relivant information: ${knowledgeBase}
                    `,
                    temperature: 0.7,
                    topK: 1000
                });
            }

            const stream = session.promptStreaming(question);

            console.log("Stream started", stream);

            for await (const chunk of stream) {
                if (!chunk.trim()) continue;

                // Get only the new content by comparing with the complete response
                const newContent = chunk.slice(lastChunkLength);
                if (!newContent.trim()) continue;
                completeResponse = chunk;
                lastChunkLength = chunk.length;

                // Convert markdown to HTML with link support
                const formattedContent = newContent
                    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, url) => {
                        return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="chat-link">${text}</a>`;
                    })
                    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
                    .replace(/\*(.*?)\*/g, "<em>$1</em>")
                    .replace(/`(.*?)`/g, "<code>$1</code>")
                    .replace(/\n\n/g, "<br><br>")
                    .replace(/^[\s]*[-*]\s+(.*)/gm, "<li>$1</li>");

                const hasListItems = formattedContent.includes("<li>");
                const wrappedContent = hasListItems
                    ? `<ul>${formattedContent}</ul>`
                    : formattedContent;

                // Append only the new content
                messageDiv.innerHTML += wrappedContent;
                messagesContainer.scrollTop = messagesContainer.scrollHeight;

                if (!/^\s+$/.test(newContent)) {
                    await new Promise((resolve) => setTimeout(resolve, 30));
                }
            }
        } catch (error) {
            console.error("Stream error:", error);
            throw new Error(`Error fetching completion: ${error.message}`);
        }
    }

    function appendMessage(role, content) {
        const messageDiv = document.createElement("div");
        messageDiv.className = `chat-message ${role}-message`;

        // Handle different message types
        if (role === "assistant") {
            // Parse markdown and sanitize HTML
            const formattedContent = content
                .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
                .replace(/\*(.*?)\*/g, "<em>$1</em>")
                .replace(/`(.*?)`/g, "<code>$1</code>")
                .replace(/\n\n/g, "<br><br>")
                .replace(/^[\s]*[-*]\s+(.*)/gm, "<li>$1</li>"); // Fix list item regex

            // Wrap lists in ul tags only if there are list items
            const hasListItems = formattedContent.includes("<li>");
            const wrappedContent = hasListItems
                ? `<ul>${formattedContent}</ul>`
                : formattedContent;

            messageDiv.innerHTML = wrappedContent;
        } else {
            // For user messages and errors, use text content for safety
            messageDiv.textContent = content;
        }

        // Get messages container from shadow DOM
        const messagesContainer = shadow.querySelector(".chat-messages");
        if (messagesContainer) {
            messagesContainer.appendChild(messageDiv);
            // Update the scroll behavior to be more reliable
            requestAnimationFrame(() => {
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
            });
        } else {
            console.error("Messages container not found in shadow DOM");
        }
        return messageDiv;
    }

    sendButton = chatWindow.querySelector(".chat-send-button");

    sendButton.addEventListener("click", handleChat);

    chatInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleChat();
        }
    });

    // Append elements to shadow DOM instead of document.body
    shadow.appendChild(controlButton);
    shadow.appendChild(chatWindow);

    // Append the container to document.body
    document.body.appendChild(container);

    // Add these new functions
    function removeAllHighlights() {
        const highlights = document.querySelectorAll(".chat-highlight");
        highlights.forEach((highlight) => {
            const parent = highlight.parentNode;
            parent.replaceChild(
                document.createTextNode(highlight.textContent),
                highlight
            );
        });
    }

    async function highlightRelevantContent(question, pageContext) {
        try {
            const response = await runPrompt(question, {
                systemPrompt: "Find 2-3 most relevant text segments from the webpage content that answer the question. Return ONLY the exact text segments, separated by |||. Do not add any additional text or explanations.",
                temperature: 0.7,
                topK: 4000,
            });

            // if (!response.ok) {
            //     throw new Error(`API request failed with status ${response.status}`);
            // }

            const data = await response.json();

            console.log('API response:', data);

            // Check if we have a valid response with content
            if (!data.choices?.[0]?.message?.content) {
                console.warn('No relevant content found');
                return;
            }

            // Remove previous highlights
            removeAllHighlights();

            // Split the content and filter out empty segments
            const relevantSegments = data.choices[0].message.content
                .split('|||')
                .map(segment => segment.trim())
                .filter(segment => segment.length > 0);

            console.log('Found segments:', relevantSegments);

            // Highlight each relevant segment
            for (const segment of relevantSegments) {
                if (segment) {
                    highlightTextInDocument(segment);
                }
            }
        } catch (error) {
            console.error("Error identifying relevant content:", error);
            // Optionally show user feedback
            const messagesContainer = shadow.querySelector(".chat-messages");
            if (messagesContainer) {
                console.log("error", "Sorry, I couldn't highlight relevant content.");
            }
        }
    }

    function highlightTextInDocument(textToFind) {
        if (!textToFind || textToFind.length < 10) return; // Minimum 5 characters


        // Normalize and split into words
        const searchWords = textToFind.trim()
            .toLowerCase()
            .split(/\s+/) // Split on whitespace
            .reduce((chunks, word, index) => { // Group into chunks of 4 words
                const chunkIndex = Math.floor(index / 4);
                if (!chunks[chunkIndex]) chunks[chunkIndex] = [];
                chunks[chunkIndex].push(word);
                return chunks;
            }, [])
            .map(chunk => chunk.join(' '));

        const treeWalker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: function (node) {
                    const parent = node.parentElement;
                    if (
                        parent?.closest("#ai-chat-extension-root") ||
                        parent?.tagName === "SCRIPT" ||
                        parent?.tagName === "STYLE" ||
                        parent?.tagName === "NOSCRIPT" ||
                        parent?.classList.contains("chat-highlight") ||
                        getComputedStyle(parent).display === "none" ||
                        getComputedStyle(parent).visibility === "hidden"
                    ) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    return NodeFilter.FILTER_ACCEPT;
                }
            }
        );

        const nodesToHighlight = [];
        let currentNode;

        while ((currentNode = treeWalker.nextNode())) {
            const nodeText = currentNode.textContent.trim();
            if (nodeText.length < 5) continue; // Skip very short text nodes

            const normalizedNodeText = nodeText.toLowerCase();

            // Check for different types of matches
            const isExactMatch = normalizedNodeText.includes(textToFind.toLowerCase());
            const wordMatches = searchWords.filter(word =>
                normalizedNodeText.includes(word)
            );

            // Calculate match quality (percentage of matching words)
            const matchQuality = wordMatches.length / searchWords.length;

            if (isExactMatch || matchQuality > 0.3) { // Match if 30% or more words match
                nodesToHighlight.push({
                    node: currentNode,
                    text: nodeText,
                    quality: isExactMatch ? 1 : matchQuality,
                    matchedWords: wordMatches
                });
            }
        }

        // Sort by match quality (best matches first)
        nodesToHighlight.sort((a, b) => b.quality - a.quality);

        // Limit to top 5 matches
        const topMatches = nodesToHighlight.slice(0, 5);

        // Highlight the matches
        topMatches.forEach(({ node, matchedWords }) => {
            const parent = node.parentNode;
            if (!parent) return;

            const highlightSpan = document.createElement("span");
            highlightSpan.className = "chat-highlight";

            // Create the highlighted text
            const text = node.textContent;
            let html = text;

            // Highlight matched words within the text
            matchedWords.forEach(word => {
                const regex = new RegExp(`(${word})`, 'gi');
                html = html.replace(regex, '<strong>$1</strong>');
            });

            highlightSpan.innerHTML = html;

            // Replace the original node
            parent.replaceChild(highlightSpan, node);

            // Scroll into view with a small delay to ensure DOM update
            setTimeout(() => {
                highlightSpan.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center',
                    inline: 'nearest'
                });
            }, 100);
        });

        // Add pulsing effect to highlights
        const style = document.createElement('style');
        style.textContent = `
      .chat-highlight strong {
        background-color: rgba(255, 165, 0, 0.5) !important;
        padding: 0 2px !important;
        border-radius: 2px !important;
        animation: pulse-highlight 2s infinite !important;
      }

      @keyframes pulse-highlight {
        0% { background-color: rgba(255, 165, 0, 0.5) !important; }
        50% { background-color: rgba(255, 165, 0, 0.8) !important; }
        100% { background-color: rgba(255, 165, 0, 0.5) !important; }
      }
    `;
        document.head.appendChild(style);
    }

    // Add voice toggle handler
    const voiceToggle = shadow.querySelector(".voice-toggle");
    voiceToggle.addEventListener("click", () => {
        isSpeaking = !isSpeaking;

        if (SpeechRecognition) {
            if (!recognition) {
                initializeSpeechRecognition();
            }

            isListening = !isListening;
            if (isListening) {
                recognition.start();
            } else {
                recognition.stop();
            }
        } else {
            console.warn('Speech recognition not supported in this browser');
        }

        updateVoiceIcon(isSpeaking || isListening);
    });

    // Add this function to show/hide chat input
    function toggleChatInput() {
        const chatInputContainer = shadow.querySelector('.chat-input-container');
        if (!chatInputContainer) return;

        const isVisible = chatInputContainer.style.display !== 'none';
        chatInputContainer.style.display = isVisible ? 'none' : 'flex';

        // Focus the input when showing
        if (!isVisible) {
            const chatInput = chatInputContainer.querySelector('.chat-input');
            if (chatInput) {
                chatInput.focus();
            }
        }
    }

    // Add keyboard shortcut listener
    document.addEventListener('keydown', (event) => {
        if (event.key.toLowerCase() === '©') {
            event.preventDefault();
            toggleChatInput();
        }
    });

    // Initially hide the chat input container
    const chatInputContainer = shadow.querySelector('.chat-input-container');
    if (chatInputContainer) {
        chatInputContainer.style.display = 'none';
    }
}

// Initialize the interface
createChatInterface();
