/**
 * AI Avatar WebRTC Client - Talk Page Version
 */

class AvatarClient {
    constructor() {
        // WebRTC related
        this.pc = null;
        this.dataChannel = null;
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.recognition = null;
        
        // State management
        this.isConnected = false;
        this.isRecording = false;
        this.isSpeaking = false;
        this.sessionid = 0;
        this.subtitleEnabled = true;  // Subtitle toggle state
        this.subtitleTimer = null;  // Subtitle hide timer
        this.currentSubtitle = '';  // Current subtitle text
        
        // DOM elements
        this.remoteVideo = document.getElementById('remoteVideo');
        this.loadingOverlay = document.getElementById('loadingOverlay');
        this.subtitleOverlay = document.getElementById('subtitleOverlay');
        
        // Get URL parameters
        this.avatarId = this.getUrlParam('avatar') || 'ai_model';
        this.avatarName = 'AI Avatar';  // Default name, will be updated from config
        this.avatarImage = '';  // Avatar image path
        
        // Initialize
        this.init();
    }

    async init() {
        try {
            // Load avatar config from API
            await this.loadAvatarConfig();
            
            // Set page title
            document.title = `Chat with ${this.avatarName}`;
            
            // Hide all control buttons (calling state)
            this.hideControlButtons();
            
            // Connect WebRTC
            await this.connect();
            
            // Setup speech recognition
            this.setupSpeechRecognition();
            
            // Setup push to talk
            this.setupPushToTalk();
            
        } catch (error) {
            console.error('Initialization failed:', error);
            this.showError('Initialization failed, please refresh the page');
        }
    }

    getUrlParam(name) {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get(name);
    }

    async loadAvatarConfig() {
        try {
            // Load avatar config from API
            const response = await fetch('/api/avatars');
            const result = await response.json();
            
            if (result.code === 0 && result.data) {
                const avatarConfig = result.data.find(a => a.id === this.avatarId);
                if (avatarConfig) {
                    this.avatarName = avatarConfig.name;
                    this.avatarImage = avatarConfig.image;
                    console.log(`Avatar config loaded: ${this.avatarName}, image: ${this.avatarImage}`);
                    
                    // Set loading background and icon
                    this.setLoadingBackground();
                } else {
                    console.warn(`Avatar config not found: ${this.avatarId}`);
                }
            }
        } catch (error) {
            console.error('Failed to load avatar config:', error);
        }
    }

    setLoadingBackground() {
        if (this.avatarImage) {
            // Set loading overlay background image (using separate background layer)
            const loadingBg = document.getElementById('loadingBackground');
            if (loadingBg) {
                loadingBg.style.backgroundImage = `url(${this.avatarImage})`;
            }
            
            // Set loading icon to avatar image
            const loadingIcon = document.getElementById('loadingIcon');
            if (loadingIcon) {
                loadingIcon.innerHTML = `<img src="${this.avatarImage}" alt="${this.avatarName}">`;
            }
        }
    }

    updateLoadingProgress(text) {
        const progressEl = document.getElementById('loadingProgress');
        if (progressEl) {
            progressEl.textContent = text;
        }
    }

    async connect() {
        try {
            // Start negotiate immediately to reduce delay
            // Create RTCPeerConnection
            this.pc = new RTCPeerConnection({
                sdpSemantics: 'unified-plan',
                iceServers: []
            });

            // Listen for remote video stream
            this.pc.addEventListener('track', (event) => {
                console.log('Received remote stream:', event.track.kind);
                if (event.track.kind === 'video') {
                    this.remoteVideo.srcObject = event.streams[0];
                    this.hideLoading();
                    // Show all control buttons after connected
                    this.showControlButtons();
                }
            });

            // ICE candidate handling
            this.pc.onicecandidate = (event) => {
                if (event.candidate) {
                    console.log('ICE candidate:', event.candidate);
                }
            };

            // Connection state monitoring
            this.pc.onconnectionstatechange = () => {
                console.log('Connection state:', this.pc.connectionState);
                if (this.pc.connectionState === 'connected') {
                    this.isConnected = true;
                    this.hideLoading();
                    // Show all control buttons after connected
                    this.showControlButtons();
                } else if (this.pc.connectionState === 'failed') {
                    this.showError('Connection failed, please refresh the page');
                }
            };

            // Create data channel
            this.dataChannel = this.pc.createDataChannel('chat');
            this.setupDataChannel();

            // Negotiate connection
            await this.negotiate();

            console.log('WebRTC connection successful');

        } catch (error) {
            console.error('Connection failed:', error);
            this.showError('Connection failed: ' + error.message);
            throw error;
        }
    }

    async negotiate() {
        try {
            // Update progress
            this.updateLoadingProgress('Establishing connection...');
            
            // Add transceivers
            this.pc.addTransceiver('video', { direction: 'recvonly' });
            this.pc.addTransceiver('audio', { direction: 'recvonly' });

            // Create offer
            const offer = await this.pc.createOffer();
            await this.pc.setLocalDescription(offer);

            this.updateLoadingProgress('Gathering information...');
            
            // Wait for ICE gathering to complete
            await new Promise((resolve) => {
                if (this.pc.iceGatheringState === 'complete') {
                    resolve();
                } else {
                    const checkState = () => {
                        if (this.pc.iceGatheringState === 'complete') {
                            this.pc.removeEventListener('icegatheringstatechange', checkState);
                            resolve();
                        }
                    };
                    this.pc.addEventListener('icegatheringstatechange', checkState);
                }
            });

            this.updateLoadingProgress('Loading AI avatar...');
            
            // Record start time
            const startTime = Date.now();
            
            // Send offer to server
            const response = await fetch('/offer', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    sdp: this.pc.localDescription.sdp,
                    type: this.pc.localDescription.type,
                    avatar_id: this.avatarId
                })
            });

            const answer = await response.json();
            
            // Record elapsed time
            const elapsedTime = Date.now() - startTime;
            console.log(`Offer request took: ${elapsedTime}ms`);
            
            if (elapsedTime > 3000) {
                console.warn('Offer request took too long, backend may be loading avatar model');
            }
            
            this.updateLoadingProgress('Establishing video connection...');
            
            // Save session ID
            this.sessionid = answer.sessionid;
            console.log('Session ID:', this.sessionid);
            
            // Set remote description
            await this.pc.setRemoteDescription(answer);
            
            this.updateLoadingProgress('Waiting for video stream...');
        } catch (error) {
            console.error('Negotiate failed:', error);
            this.updateLoadingProgress('Connection failed');
            throw error;
        }
    }

    setupDataChannel() {
        this.dataChannel.onopen = () => {
            console.log('Data channel opened');
        };

        this.dataChannel.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleDataChannelMessage(data);
            } catch (error) {
                console.error('Failed to process message:', error);
            }
        };

        this.dataChannel.onerror = (error) => {
            console.error('Data channel error:', error);
        };

        this.dataChannel.onclose = () => {
            console.log('Data channel closed');
            this.isConnected = false;
        };
    }

    handleDataChannelMessage(data) {
        console.log('Received data channel message:', data);

        switch (data.type) {
            case 'asr':
                // Speech recognition result
                console.log('ASR result:', data.text);
                this.showSubtitle(data.text);
                // Add to chat window
                this.addChatMessage('user', data.text);
                break;
                
            case 'llm':
                // AI response - display in subtitle and chat window
                console.log('LLM response:', data.text);
                // Accumulate subtitle text (LLM returns in streaming, split by sentences)
                this.currentSubtitle = data.text;
                this.showSubtitle(data.text);
                // Add to chat window
                this.addChatMessage('assistant', data.text);
                
                // Clear previous timer
                if (this.subtitleTimer) {
                    clearTimeout(this.subtitleTimer);
                    this.subtitleTimer = null;
                }
                
                // Note: Don't set hide timer here, wait for tts_end event
                break;
                
            case 'tts_start':
                // Start speaking
                this.isSpeaking = true;
                console.log('Avatar started speaking');
                
                // Clear any existing hide timer
                if (this.subtitleTimer) {
                    clearTimeout(this.subtitleTimer);
                    this.subtitleTimer = null;
                }
                break;
                
            case 'tts_end':
                // Finish speaking
                this.isSpeaking = false;
                console.log('Avatar finished speaking');
                
                // Hide subtitle after 3 seconds when avatar finishes speaking
                if (this.subtitleTimer) {
                    clearTimeout(this.subtitleTimer);
                }
                this.subtitleTimer = setTimeout(() => {
                    this.hideSubtitle();
                }, 3000);
                break;
                
            case 'error':
                // Error message
                console.error('Error:', data.message);
                this.showError(data.message);
                break;
        }
    }

    // Send text message using main.py's human function
    async sendTextMessage(text) {
        if (!text || !text.trim()) return;

        try {
            console.log('Sending chat message:', text);
            
            // Display in subtitle
            this.showSubtitle(text);
            
            // Add to chat window
            this.addChatMessage('user', text);
            
            // Use /human endpoint with type='chat'
            const response = await fetch('/human', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    text: text,
                    type: 'chat',
                    interrupt: true,
                    sessionid: this.sessionid
                })
            });

            const data = await response.json();
            console.log('Send successful:', data);
            
            // LLM response will be returned via data channel, handled in handleDataChannelMessage

        } catch (error) {
            console.error('Failed to send message:', error);
            this.showError('Send failed, please try again');
        }
    }

    // Add chat message to window
    addChatMessage(role, text) {
        const chatMessages = document.getElementById('chatMessages');
        if (!chatMessages) {
            console.error('chatMessages element not found');
            return;
        }

        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${role}`;
        
        const labelDiv = document.createElement('div');
        labelDiv.className = 'message-label';
        labelDiv.textContent = role === 'user' ? '' : this.avatarName;
        
        const bubbleDiv = document.createElement('div');
        bubbleDiv.className = 'message-bubble';
        bubbleDiv.textContent = text;
        
        messageDiv.appendChild(labelDiv);
        messageDiv.appendChild(bubbleDiv);
        chatMessages.appendChild(messageDiv);
        
        // Scroll to bottom
        chatMessages.scrollTop = chatMessages.scrollHeight;
        
        console.log('Added chat message:', role, text);
    }

    // Setup speech recognition
    setupSpeechRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        
        if (SpeechRecognition) {
            this.recognition = new SpeechRecognition();
            this.recognition.continuous = true; // Continuous recognition
            this.recognition.interimResults = true; // Interim results
            this.recognition.lang = 'en-US';

            this.recognition.onresult = (event) => {
                let interimTranscript = '';
                let finalTranscript = '';
                
                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) {
                        finalTranscript += event.results[i][0].transcript;
                    } else {
                        interimTranscript += event.results[i][0].transcript;
                    }
                }
                
                // Display interim results in subtitle
                if (interimTranscript) {
                    this.showSubtitle(interimTranscript);
                }
                
                // Send final result to server
                if (finalTranscript) {
                    console.log('Speech recognition final result:', finalTranscript);
                    this.sendTextMessage(finalTranscript);
                }
            };

            this.recognition.onerror = (event) => {
                console.error('Speech recognition error:', event.error);
                if (event.error !== 'no-speech') {
                    this.showError('Speech recognition failed: ' + event.error);
                }
            };

            this.recognition.onend = () => {
                console.log('Speech recognition ended');
                this.stopVoiceInput();
            };
        } else {
            console.warn('Browser does not support speech recognition');
        }
    }

    // Setup push to talk functionality
    setupPushToTalk() {
        // In fullscreen mode, use entire screen as push to talk area
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        let touchStartTime = 0;
        let recordingTimeout;
        
        // Add touch events to document
        document.addEventListener('touchstart', (e) => {
            // Avoid triggering when clicking buttons
            if (e.target.tagName === 'BUTTON' || e.target.closest('button') || e.target.closest('.chat-window')) {
                return;
            }
            
            touchStartTime = Date.now();
            
            // Delay starting recording to avoid accidental triggers
            recordingTimeout = setTimeout(() => {
                this.startVoiceInput();
            }, 200);
        });
        
        document.addEventListener('touchend', (e) => {
            if (e.target.tagName === 'BUTTON' || e.target.closest('button') || e.target.closest('.chat-window')) {
                return;
            }
            
            // Clear delayed start
            if (recordingTimeout) {
                clearTimeout(recordingTimeout);
            }
            
            // Check if it's a short tap (less than 200ms)
            const touchDuration = Date.now() - touchStartTime;
            if (touchDuration < 200 && !this.isRecording) {
                return;
            }
            
            if (this.isRecording) {
                this.stopVoiceInput();
            }
        });
        
        // Desktop: use spacebar
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && !this.isRecording && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
                e.preventDefault();
                this.startVoiceInput();
            }
        });
        
        document.addEventListener('keyup', (e) => {
            if (e.code === 'Space' && this.isRecording) {
                e.preventDefault();
                this.stopVoiceInput();
            }
        });
    }

    // Toggle voice input state (microphone button)
    toggleVoiceInput() {
        if (this.isRecording) {
            this.stopVoiceInput();
            // Update button state
            const micBtn = document.getElementById('micBtn');
            if (micBtn) {
                micBtn.classList.remove('recording');
            }
        } else {
            this.startVoiceInput();
            // Update button state
            const micBtn = document.getElementById('micBtn');
            if (micBtn) {
                micBtn.classList.add('recording');
            }
        }
    }

    // Start voice input recording
    async startVoiceInput() {
        if (this.isRecording) return;
        
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            this.audioChunks = [];
            this.mediaRecorder = new MediaRecorder(stream);
            
            this.mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    this.audioChunks.push(e.data);
                }
            };
            
            this.mediaRecorder.onstop = () => {
                stream.getTracks().forEach(track => track.stop());
            };
            
            this.mediaRecorder.start();
            this.isRecording = true;
            
            // Update microphone button state
            const micBtn = document.getElementById('micBtn');
            if (micBtn) {
                micBtn.classList.add('recording');
            }
            
            // Show recording prompt
            this.showSubtitle('Recording, release to send...');
            
            // Start speech recognition
            if (this.recognition) {
                try {
                    this.recognition.start();
                } catch (error) {
                    console.error('Failed to start speech recognition:', error);
                }
            }
            
        } catch (error) {
            console.error('Cannot access microphone:', error);
            this.showError('Cannot access microphone, please check browser permissions');
        }
    }

    stopVoiceInput() {
        if (!this.isRecording) return;
        
        this.isRecording = false;
        
        // Update microphone button state
        const micBtn = document.getElementById('micBtn');
        if (micBtn) {
            micBtn.classList.remove('recording');
        }
        
        // Stop recording
        if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
            this.mediaRecorder.stop();
        }
        
        // Stop speech recognition
        if (this.recognition) {
            try {
                this.recognition.stop();
            } catch (error) {
                console.error('Failed to stop speech recognition:', error);
            }
        }
    }

    showSubtitle(text) {
        // Only show when subtitles are enabled
        if (this.subtitleEnabled) {
            this.subtitleOverlay.textContent = text;
            this.subtitleOverlay.classList.add('show');
        }
    }

    hideSubtitle() {
        // Clear timer
        if (this.subtitleTimer) {
            clearTimeout(this.subtitleTimer);
            this.subtitleTimer = null;
        }
        
        // Delay hide for transition animation
        setTimeout(() => {
            this.subtitleOverlay.classList.remove('show');
        }, 100);
    }

    // Toggle subtitle display state
    toggleSubtitle() {
        this.subtitleEnabled = !this.subtitleEnabled;
        console.log('Subtitle state:', this.subtitleEnabled ? 'on' : 'off');
        
        // If subtitles are disabled, immediately hide current subtitle
        if (!this.subtitleEnabled) {
            this.subtitleOverlay.classList.remove('show');
        }
    }

    // Hide control buttons (calling state)
    hideControlButtons() {
        document.getElementById('subtitleBtn').classList.add('hidden');
        document.getElementById('micBtn').classList.add('hidden');
        document.getElementById('chatToggleBtn').classList.add('hidden');
    }

    // Show control buttons (after connected)
    showControlButtons() {
        document.getElementById('subtitleBtn').classList.remove('hidden');
        document.getElementById('micBtn').classList.remove('hidden');
        document.getElementById('chatToggleBtn').classList.remove('hidden');
    }

    hideLoading() {
        this.loadingOverlay.classList.add('hidden');
    }

    showError(message) {
        console.error(message);
        alert(message);
    }

    disconnect() {
        // Stop voice input
        this.stopVoiceInput();

        // Close data channel
        if (this.dataChannel) {
            this.dataChannel.close();
            this.dataChannel = null;
        }

        // Close PeerConnection
        if (this.pc) {
            // Delay close to ensure cleanup completes
            setTimeout(() => {
                if (this.pc) {
                    this.pc.close();
                    this.pc = null;
                }
            }, 500);
        }

        this.isConnected = false;
    }
}

// Global instance
let avatarClient;

// Initialize immediately, don't wait for DOMContentLoaded
(function initClient() {
    // Check if DOM is loaded
    if (document.readyState === 'loading') {
        // DOM not loaded, wait for DOMContentLoaded
        document.addEventListener('DOMContentLoaded', () => {
            console.log('DOMContentLoaded - Initializing client');
            avatarClient = new AvatarClient();
            window.avatarClient = avatarClient;
        });
    } else {
        // DOM loaded, initialize immediately
        console.log('DOM ready - Initializing client immediately');
        avatarClient = new AvatarClient();
        window.avatarClient = avatarClient;
    }
})();

// Disconnect when page closes
window.onunload = function(event) {
    if (avatarClient && avatarClient.pc) {
        avatarClient.pc.close();
    }
};
