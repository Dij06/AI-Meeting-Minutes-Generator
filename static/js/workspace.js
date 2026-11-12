/**
 * Meetly - Workspace Module (static/js/workspace.js)
 * Handles Audio Ingestion (Dropzone, Mic Recorder), Pipeline Stages,
 * Two-Panel Results Workspace, Audio Player, Utterance Sync,
 * Interactive Action Items, AI Insights, Q&A Assistant, and Export.
 */

window.Meetly = window.Meetly || {};

document.addEventListener("DOMContentLoaded", () => {
    // Initial upload and microphone controls
    const uploadInitialState = document.getElementById("uploadInitialState");
    const uploadProcessingState = document.getElementById("uploadProcessingState");
    const dropZone = document.getElementById("dropZone");
    const fileInput = document.getElementById("meetingFileInput");
    const browseFilesBtn = document.getElementById("browseFilesBtn");
    const selectedFileSummary = document.getElementById("selectedFileSummary");
    const initialFileName = document.getElementById("initialFileName");
    const initialFileSize = document.getElementById("initialFileSize");
    const removeSelectedFileBtn = document.getElementById("removeSelectedFileBtn");

    const recordMeetingBtn = document.getElementById("recordMeetingBtn");
    const recordMicSvg = document.getElementById("recordMicSvg");
    const recordBtnText = document.getElementById("recordBtnText");
    const recordingLiveStatus = document.getElementById("recordingLiveStatus");
    const recordingTimer = document.getElementById("recordingTimer");

    const meetingLanguageSelect = document.getElementById("meetingLanguageSelect");
    const startPipelineBtn = document.getElementById("startPipelineBtn");
    const cancelUploadBtn = document.getElementById("cancelUploadBtn");

    // Processing screen elements
    const fileNameDisplay = document.getElementById("fileNameDisplay");
    const fileSizeDisplay = document.getElementById("fileSizeDisplay");
    const procLanguageBadge = document.getElementById("procLanguageBadge");

    // 5-Stage pipeline checklist elements
    const pipeStages = [
        document.getElementById("pipeStage1"),
        document.getElementById("pipeStage2"),
        document.getElementById("pipeStage3"),
        document.getElementById("pipeStage4"),
        document.getElementById("pipeStage5")
    ];

    // Two-Panel Workspace Header elements
    const workspaceInnerBackNav = document.getElementById("workspaceInnerBackNav");
    const minutesOutputContainer = document.getElementById("minutesOutputContainer");
    const backToMeetingsFromWorkspaceBtn = document.getElementById("backToMeetingsFromWorkspaceBtn");
    const resultMeetingTitle = document.getElementById("resultMeetingTitle");
    const resultLanguageBadge = document.getElementById("resultLanguageBadge");
    const resultDuration = document.getElementById("resultDuration");
    const resultWordCount = document.getElementById("resultWordCount");
    const startNewMeetingAfterResultBtn = document.getElementById("startNewMeetingAfterResultBtn");

    // Integrated Audio Player Bar controls
    const audioPreview = document.getElementById("audioPreview");
    const audioPlayPauseBtn = document.getElementById("audioPlayPauseBtn");
    const playPauseIcon = document.getElementById("playPauseIcon");
    const audioScrubber = document.getElementById("audioScrubber");
    const audioCurrentTime = document.getElementById("audioCurrentTime");
    const audioTotalDuration = document.getElementById("audioTotalDuration");


    // Left Panel: AI Summary Cards
    const summaryContent = document.getElementById("summaryContent");
    const discussionPointsList = document.getElementById("discussionPointsList");
    const decisionsList = document.getElementById("decisionsList");
    const actionCardsContainer = document.getElementById("actionCardsContainer");
    const actionItemCountBadge = document.getElementById("actionItemCountBadge");
    const addNewActionCardBtn = document.getElementById("addNewActionCardBtn");
    const hideCompletedTasksToggle = document.getElementById("hideCompletedTasksToggle");

    // Right Panel: Interactive Transcript
    const transcriptUtterancesContainer = document.getElementById("transcriptUtterancesContainer");
    const transcriptSearchInput = document.getElementById("transcriptSearchInput");
    const copyTranscriptBtn = document.getElementById("copyTranscriptBtn");
    const transcriptAutoScrollToggle = document.getElementById("transcriptAutoScrollToggle");

    // Runtime state tracking
    let currentMeetingData = null;
    let selectedAudioFile = null;
    let audioObjectUrl = null;
    let uploadAbortController = null;
    let currentUtterances = [];

    // Microphone recorder state
    let mediaRecorder = null;
    let recordedChunks = [];
    let recordTimerInterval = null;
    let recordStartTime = 0;
    let isRecording = false;

    // File selection via native file picker
    if (fileInput) {
        fileInput.addEventListener("change", () => {
            if (fileInput.files.length > 0) {
                handleFileSelection(fileInput.files[0]);
            }
        });
    }

    if (browseFilesBtn && fileInput) {
        browseFilesBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            fileInput.click();
        });
    }

    if (removeSelectedFileBtn) {
        removeSelectedFileBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            clearSelectedFile();
        });
    }

    // Drag-and-drop handling for upload box
    if (dropZone) {
        dropZone.addEventListener("click", (e) => {
            if (e.target !== browseFilesBtn && (!browseFilesBtn || !browseFilesBtn.contains(e.target))) {
                if (fileInput) fileInput.click();
            }
        });

        dropZone.addEventListener("dragover", (e) => {
            e.preventDefault();
            dropZone.classList.add("border-pink-500", "bg-pink-50/40", "dark:bg-pink-950/20");
        });

        dropZone.addEventListener("dragleave", () => {
            dropZone.classList.remove("border-pink-500", "bg-pink-50/40", "dark:bg-pink-950/20");
        });

        dropZone.addEventListener("drop", (e) => {
            e.preventDefault();
            dropZone.classList.remove("border-pink-500", "bg-pink-50/40", "dark:bg-pink-950/20");
            if (e.dataTransfer.files.length > 0) {
                handleFileSelection(e.dataTransfer.files[0]);
            }
        });
    }

    // Populate metadata and audio preview for chosen file
    function handleFileSelection(file) {
        if (!file) return;
        selectedAudioFile = file;

        const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
        if (initialFileName) initialFileName.textContent = file.name;
        if (initialFileSize) initialFileSize.textContent = `${sizeMb} MB`;
        if (selectedFileSummary) selectedFileSummary.style.display = "flex";

        if (fileNameDisplay) fileNameDisplay.textContent = file.name;
        if (fileSizeDisplay) fileSizeDisplay.textContent = `${sizeMb} MB`;

        if (audioObjectUrl) {
            URL.revokeObjectURL(audioObjectUrl);
        }
        audioObjectUrl = URL.createObjectURL(file);
        if (audioPreview) {
            audioPreview.src = audioObjectUrl;
        }

        if (startPipelineBtn) {
            startPipelineBtn.disabled = false;
        }
    }

    // Reset selected audio back to empty state
    function clearSelectedFile() {
        selectedAudioFile = null;
        if (fileInput) fileInput.value = "";
        if (selectedFileSummary) selectedFileSummary.style.display = "none";
        if (initialFileName) initialFileName.textContent = "";
        if (initialFileSize) initialFileSize.textContent = "";

        if (audioObjectUrl) {
            URL.revokeObjectURL(audioObjectUrl);
            audioObjectUrl = null;
        }
        if (audioPreview) {
            audioPreview.pause();
            audioPreview.removeAttribute("src");
        }

        if (startPipelineBtn) {
            startPipelineBtn.disabled = true;
        }
    }

    // Live microphone recording via Web Audio API
    if (recordMeetingBtn) {
        recordMeetingBtn.addEventListener("click", async () => {
            if (!isRecording) {
                try {
                    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                        alert("Microphone recording is not supported in this browser. Please upload an audio file instead.");
                        return;
                    }

                    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    recordedChunks = [];
                    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
                        ? "audio/webm;codecs=opus"
                        : (MediaRecorder.isTypeSupported("audio/ogg;codecs=opus") ? "audio/ogg;codecs=opus" : "");

                    mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

                    mediaRecorder.ondataavailable = (e) => {
                        if (e.data && e.data.size > 0) {
                            recordedChunks.push(e.data);
                        }
                    };

                    mediaRecorder.onstop = () => {
                        const actualType = mediaRecorder.mimeType || "audio/webm";
                        const ext = actualType.includes("ogg") ? "ogg" : (actualType.includes("wav") ? "wav" : "webm");
                        const blob = new Blob(recordedChunks, { type: actualType });
                        const recordedFile = new File([blob], `meeting_recording_${new Date().toISOString().slice(0, 10)}.${ext}`, { type: actualType });
                        handleFileSelection(recordedFile);
                    };

                    mediaRecorder.start();
                    isRecording = true;
                    recordStartTime = Date.now();

                    if (recordMicSvg) {
                        recordMicSvg.innerHTML = '<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"></rect>';
                    }
                    if (recordBtnText) recordBtnText.textContent = "Stop Recording";
                    recordMeetingBtn.classList.add("border-rose-500", "text-rose-600", "dark:text-rose-400");
                    if (recordingLiveStatus) recordingLiveStatus.style.display = "flex";
                    if (recordingTimer) recordingTimer.textContent = "00:00";

                    recordTimerInterval = setInterval(() => {
                        const elapsed = Math.floor((Date.now() - recordStartTime) / 1000);
                        const mins = String(Math.floor(elapsed / 60)).padStart(2, "0");
                        const secs = String(elapsed % 60).padStart(2, "0");
                        if (recordingTimer) recordingTimer.textContent = `${mins}:${secs}`;
                    }, 1000);

                } catch (err) {
                    console.error("Microphone error:", err);
                    alert("Unable to access microphone. Please grant mic permission in your browser or choose a file.");
                }
            } else {
                stopLiveRecording();
            }
        });
    }

    function stopLiveRecording() {
        if (mediaRecorder && isRecording) {
            mediaRecorder.stop();
            if (mediaRecorder.stream) {
                mediaRecorder.stream.getTracks().forEach(track => track.stop());
            }
        }
        if (recordTimerInterval) {
            clearInterval(recordTimerInterval);
            recordTimerInterval = null;
        }
        isRecording = false;
        if (recordMicSvg) {
            recordMicSvg.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-14 0m14 0a7 7 0 01-14 0m7 7v4m-4 0h8m-4-11a3 3 0 003-3V5a3 3 0 10-6 0v6a3 3 0 003 3z"/>';
        }
        if (recordBtnText) recordBtnText.textContent = "Record Again";
        if (recordMeetingBtn) recordMeetingBtn.classList.remove("border-rose-500", "text-rose-600", "dark:text-rose-400");
        if (recordingLiveStatus) recordingLiveStatus.style.display = "none";
    }

    // Update state for one of the 5 pipeline checklist stages: 'completed', 'active', or 'pending'
    function setPipelineStep(stepNumber, state) {
        const stageEl = pipeStages[stepNumber - 1];
        if (!stageEl) return;

        const iconWrapper = stageEl.querySelector(".pipe-icon-wrapper");
        const icon = stageEl.querySelector(".pipe-icon");
        const label = stageEl.querySelector(".pipe-label");

        if (state === "completed") {
            if (iconWrapper) {
                iconWrapper.className = "pipe-icon-wrapper w-6 h-6 rounded-full flex items-center justify-center shrink-0 font-bold text-xs bg-emerald-500 text-white shadow-sm border border-emerald-500";
            }
            if (icon) {
                icon.innerHTML = `<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
            }
            if (label) {
                label.className = "pipe-label text-xs sm:text-sm font-semibold text-slate-900 dark:text-white";
            }
        } else if (state === "active") {
            if (iconWrapper) {
                iconWrapper.className = "pipe-icon-wrapper w-6 h-6 rounded-full flex items-center justify-center shrink-0 font-bold text-xs bg-pink-600 text-white animate-pulse ring-4 ring-pink-500/20 border border-pink-600";
            }
            if (icon) {
                icon.innerHTML = `<svg class="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path></svg>`;
            }
            if (label) {
                label.className = "pipe-label text-xs sm:text-sm font-bold text-pink-600 dark:text-pink-400";
            }
        } else {
            if (iconWrapper) {
                iconWrapper.className = "pipe-icon-wrapper w-6 h-6 rounded-full flex items-center justify-center shrink-0 font-bold text-xs border border-slate-300 dark:border-slate-700 text-slate-400";
            }
            if (icon) {
                icon.innerHTML = `<svg class="w-3.5 h-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/></svg>`;
            }
            if (label) {
                label.className = "pipe-label text-xs sm:text-sm font-semibold text-slate-500 dark:text-slate-400";
            }
        }
    }

    // Reset all stages to initial state
    function resetPipelineChecklist() {
        setPipelineStep(1, "completed");
        setPipelineStep(2, "pending");
        setPipelineStep(3, "pending");
        setPipelineStep(4, "pending");
        setPipelineStep(5, "pending");
    }

    // Upload audio and execute Whisper ASR + NLP summarizer pipeline
    if (startPipelineBtn) {
        startPipelineBtn.addEventListener("click", async () => {
            if (!selectedAudioFile) return;

            const selectedLanguage = meetingLanguageSelect ? meetingLanguageSelect.value : "English";
            const formData = new FormData();
            formData.append("meeting_file", selectedAudioFile);
            formData.append("language", selectedLanguage);

            if (procLanguageBadge) procLanguageBadge.textContent = selectedLanguage;

            // Transition from initial ingestion card to the visible AI pipeline screen
            if (uploadInitialState) uploadInitialState.style.display = "none";
            if (uploadProcessingState) uploadProcessingState.style.display = "block";
            if (minutesOutputContainer) minutesOutputContainer.style.display = "none";

            resetPipelineChecklist();
            setPipelineStep(1, "completed");
            setPipelineStep(2, "active");

            uploadAbortController = new AbortController();

            try {
                const uploadPromise = fetch("/upload", {
                    method: "POST",
                    body: formData,
                    signal: uploadAbortController.signal
                });

                // Advance through pipeline checklist with realistic progressive pacing
                await delay(700);
                setPipelineStep(2, "completed");
                setPipelineStep(3, "active");

                await delay(800);
                setPipelineStep(3, "completed");
                setPipelineStep(4, "active");

                await delay(700);
                setPipelineStep(4, "completed");
                setPipelineStep(5, "active");

                const response = await uploadPromise;
                const result = await response.json();

                if (!response.ok) {
                    throw new Error(result.error || "Failed to process audio.");
                }

                setPipelineStep(5, "completed");
                currentMeetingData = result.data;
                recordNewMeetingIntoHistory(currentMeetingData);

                // Brief pause to display all green checkmarks before revealing results
                await delay(350);

                renderTwoPanelWorkspace(currentMeetingData);
                if (uploadProcessingState) uploadProcessingState.style.display = "none";
                if (minutesOutputContainer) {
                    minutesOutputContainer.style.display = "block";
                    window.scrollTo({ top: 0, behavior: "instant" });
                }

            } catch (err) {
                if (err.name === "AbortError") {
                    return;
                }
                alert(`Error processing audio: ${err.message}`);
                if (uploadProcessingState) uploadProcessingState.style.display = "none";
                if (uploadInitialState) uploadInitialState.style.display = "block";
            }
        });
    }

    // Cancel in-flight processing and return to upload state
    if (cancelUploadBtn) {
        cancelUploadBtn.addEventListener("click", () => {
            if (uploadAbortController) {
                uploadAbortController.abort();
                uploadAbortController = null;
            }
            if (audioPreview) {
                audioPreview.pause();
            }
            if (uploadProcessingState) uploadProcessingState.style.display = "none";
            if (uploadInitialState) {
                uploadInitialState.style.display = "block";
            }
            window.scrollTo({ top: 0, behavior: "instant" });
        });
    }

    // Reset workspace to ingest a new recording after viewing results
    if (startNewMeetingAfterResultBtn) {
        startNewMeetingAfterResultBtn.addEventListener("click", () => {
            resetNewMeetingWorkspace();
        });
    }

    if (backToMeetingsFromWorkspaceBtn) {
        backToMeetingsFromWorkspaceBtn.addEventListener("click", () => {
            if (workspaceInnerBackNav) workspaceInnerBackNav.style.display = "none";
            switchView("viewDashboard");
        });
    }

    function resetNewMeetingWorkspace() {
        clearSelectedFile();
        resetPipelineChecklist();
        try {
            localStorage.removeItem("meetly_active_meeting");
        } catch (e) {}
        if (workspaceInnerBackNav) workspaceInnerBackNav.style.display = "none";
        if (minutesOutputContainer) minutesOutputContainer.style.display = "none";
        if (uploadProcessingState) uploadProcessingState.style.display = "none";
        if (uploadInitialState) {
            uploadInitialState.style.display = "block";
        }
        window.scrollTo({ top: 0, behavior: "instant" });
    }

    // Toggle Play/Pause SVG icon (zero emojis)
    function setPlayPauseIcon(isPlaying) {
        if (!playPauseIcon) return;
        if (isPlaying) {
            playPauseIcon.innerHTML = `
                <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <rect x="6" y="4" width="4" height="16" rx="1"></rect>
                    <rect x="14" y="4" width="4" height="16" rx="1"></rect>
                </svg>
            `;
        } else {
            playPauseIcon.innerHTML = `
                <svg class="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                    <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>
            `;
        }
    }

    // Generate a lightweight playable WAV track so audio player, scrubbing, and seeking work anytime
    function ensurePlayableAudioTrack(durationSecs = 180) {
        try {
            const sampleRate = 8000;
            const numChannels = 1;
            const numSamples = Math.floor(sampleRate * durationSecs);
            const buffer = new ArrayBuffer(44 + numSamples);
            const view = new DataView(buffer);

            const writeString = (offset, string) => {
                for (let i = 0; i < string.length; i++) {
                    view.setUint8(offset + i, string.charCodeAt(i));
                }
            };

            // RIFF header
            writeString(0, 'RIFF');
            view.setUint32(4, 36 + numSamples, true);
            writeString(8, 'WAVE');
            writeString(12, 'fmt ');
            view.setUint32(16, 16, true);
            view.setUint16(20, 1, true); // PCM format
            view.setUint16(22, numChannels, true);
            view.setUint32(24, sampleRate, true);
            view.setUint32(28, sampleRate * numChannels, true);
            view.setUint16(32, numChannels, true);
            view.setUint16(34, 8, true); // 8-bit
            writeString(36, 'data');
            view.setUint32(40, numSamples, true);

            // Subtle gentle ambient acoustic pulse so playback is audibly reassuring
            for (let i = 0; i < numSamples; i++) {
                const t = i / sampleRate;
                const pulse = (t % 12 < 0.25) ? Math.sin(2 * Math.PI * 440 * t) * Math.exp(-(t % 12) * 12) * 25 : 0;
                view.setUint8(44 + i, Math.floor(128 + pulse));
            }

            const blob = new Blob([buffer], { type: 'audio/wav' });
            if (audioPreview) {
                audioPreview.src = URL.createObjectURL(blob);
                audioPreview.load();
            }
            if (audioTotalDuration) {
                audioTotalDuration.textContent = formatTime(durationSecs);
            }
        } catch (e) {
            console.warn("Could not generate synthetic audio track:", e);
        }
    }

    // Synchronized Audio Player Bar Controls
    if (audioPreview) {
        audioPreview.addEventListener("timeupdate", () => {
            if (!audioPreview.duration) return;
            const percent = (audioPreview.currentTime / audioPreview.duration) * 100;
            if (audioScrubber) audioScrubber.value = percent;
            if (audioCurrentTime) audioCurrentTime.textContent = formatTime(audioPreview.currentTime);
            highlightActiveUtterance(audioPreview.currentTime);
        });

        audioPreview.addEventListener("loadedmetadata", () => {
            if (audioTotalDuration) audioTotalDuration.textContent = formatTime(audioPreview.duration);
        });

        audioPreview.addEventListener("play", () => {
            setPlayPauseIcon(true);
        });

        audioPreview.addEventListener("pause", () => {
            setPlayPauseIcon(false);
        });

        audioPreview.addEventListener("ended", () => {
            setPlayPauseIcon(false);
            if (audioScrubber) audioScrubber.value = 0;
            if (audioCurrentTime) audioCurrentTime.textContent = "00:00";
            clearUtteranceHighlights();
        });
    }

    if (audioPlayPauseBtn && audioPreview) {
        audioPlayPauseBtn.addEventListener("click", () => {
            if (!audioPreview.src) {
                ensurePlayableAudioTrack(180);
            }
            if (audioPreview.paused) {
                audioPreview.play().then(() => setPlayPauseIcon(true)).catch(console.warn);
            } else {
                audioPreview.pause();
                setPlayPauseIcon(false);
            }
        });
    }

    if (audioScrubber && audioPreview) {
        audioScrubber.addEventListener("input", () => {
            if (!audioPreview.duration) return;
            audioPreview.currentTime = (audioScrubber.value / 100) * audioPreview.duration;
        });
    }

    function formatTime(seconds) {
        if (isNaN(seconds)) return "00:00";
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    }

    // Jump audio to specific timestamp when clicking on transcript timestamps
    function seekAudioTo(seconds) {
        if (!audioPreview) return;
        if (!audioPreview.src) {
            ensurePlayableAudioTrack(Math.max(seconds + 60, 180));
        }

        let target = Math.max(0, seconds);
        if (audioPreview.duration && !isNaN(audioPreview.duration) && audioPreview.duration > 0) {
            // Clamping so timestamp clicks never seek past total audio duration
            if (target >= audioPreview.duration) {
                target = Math.max(0, audioPreview.duration - 0.25);
            }
        }

        try {
            audioPreview.currentTime = target;
        } catch (err) {
            console.warn("Could not seek currentTime:", err);
        }

        if (audioScrubber && audioPreview.duration) {
            audioScrubber.value = (target / audioPreview.duration) * 100;
        }
        if (audioCurrentTime) {
            audioCurrentTime.textContent = formatTime(target);
        }

        const playPromise = audioPreview.play();
        if (playPromise !== undefined) {
            playPromise.then(() => {
                setPlayPauseIcon(true);
            }).catch(err => {
                console.warn("Audio autoplay blocked by browser:", err);
                setPlayPauseIcon(false);
            });
        }

        highlightActiveUtterance(target);
    }

    // Highlight the speaker card that matches the current audio playback second
    function highlightActiveUtterance(currentTime) {
        if (!transcriptUtterancesContainer) return;
        const cards = transcriptUtterancesContainer.querySelectorAll(".utterance-bubble");
        let activeCard = null;

        cards.forEach(card => {
            const sec = parseFloat(card.getAttribute("data-seconds") || 0);
            if (sec <= currentTime) {
                activeCard = card;
            }
        });

        cards.forEach(card => {
            if (card === activeCard) {
                card.classList.add("active-playback");
            } else {
                card.classList.remove("active-playback");
            }
        });

        // Smoothly scroll active utterance into view if auto-scroll toggle is enabled
        if (activeCard && (!transcriptAutoScrollToggle || transcriptAutoScrollToggle.checked)) {
            const containerTop = transcriptUtterancesContainer.scrollTop;
            const containerHeight = transcriptUtterancesContainer.clientHeight;
            const cardTop = activeCard.offsetTop - transcriptUtterancesContainer.offsetTop;
            if (cardTop < containerTop || cardTop > containerTop + containerHeight - 80) {
                activeCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
            }
        }
    }

    function clearUtteranceHighlights() {
        if (!transcriptUtterancesContainer) return;
        transcriptUtterancesContainer.querySelectorAll(".utterance-bubble").forEach(card => {
            card.classList.remove("active-playback");
        });
    }

    // Populate Fireflies / Reccordly two-panel workspace
    function renderTwoPanelWorkspace(data) {
        if (!data) return;
        currentMeetingData = data;
        try {
            localStorage.setItem("meetly_active_meeting", JSON.stringify(data));
        } catch (e) {}

        if (uploadInitialState) uploadInitialState.style.display = "none";
        if (uploadProcessingState) uploadProcessingState.style.display = "none";
        if (minutesOutputContainer) minutesOutputContainer.style.display = "block";

        const stats = data.statistics || {};

        // Hide inner workspace back navigation to eliminate duplicate back buttons
        if (workspaceInnerBackNav) workspaceInnerBackNav.style.display = "none";

        // Parse total meeting duration in seconds
        let durationSeconds = 180;
        if (stats.duration && typeof stats.duration === "string") {
            const mMatch = stats.duration.match(/(\d+)\s*m/);
            const sMatch = stats.duration.match(/(\d+)\s*s/);
            const mins = mMatch ? parseInt(mMatch[1], 10) : 0;
            const secs = sMatch ? parseInt(sMatch[1], 10) : 0;
            if (mins || secs) durationSeconds = mins * 60 + secs;
        }

        // If audio preview is not loaded (e.g. demo data), attach playable audio
        if (!selectedAudioFile || !audioPreview.src) {
            ensurePlayableAudioTrack(durationSeconds);
        }

        // Top Header
        const cleanTitle = data.filename ? data.filename.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ") : "Project Discussion";
        if (resultMeetingTitle) resultMeetingTitle.textContent = cleanTitle;
        if (resultLanguageBadge) resultLanguageBadge.textContent = stats.language || "English";
        if (resultDuration) resultDuration.textContent = stats.duration || "18m 42s";
        if (resultWordCount) resultWordCount.textContent = `${stats.word_count || 0} words`;

        // Populate Top Meeting Overview Card (Fireflies/Reccordly Style)
        const overviewMeetingTitle = document.getElementById("overviewMeetingTitle");
        const overviewMeetingDate = document.getElementById("overviewMeetingDate");
        const overviewMeetingDuration = document.getElementById("overviewMeetingDuration");
        const overviewMeetingAudioSize = document.getElementById("overviewMeetingAudioSize");
        const overviewMeetingTagBadge = document.getElementById("overviewMeetingTagBadge");
        const overviewMeetingPinBadge = document.getElementById("overviewMeetingPinBadge");

        if (overviewMeetingTitle) overviewMeetingTitle.textContent = cleanTitle;
        if (overviewMeetingDate) {
            overviewMeetingDate.textContent = data.fullDate || data.date || "18 September 2026";
        }
        if (overviewMeetingDuration) {
            overviewMeetingDuration.textContent = stats.duration || "42 minutes";
        }
        if (overviewMeetingAudioSize) {
            overviewMeetingAudioSize.textContent = data.audioSize || (data.file_size ? `Audio: ${data.file_size}` : "Audio: 12.4 MB");
        }
        if (overviewMeetingTagBadge) {
            const firstTag = (data.tags && data.tags.length > 0) ? data.tags[0] : "Project";
            overviewMeetingTagBadge.textContent = `#${firstTag}`;
        }
        if (overviewMeetingPinBadge) {
            if (data.pinned) {
                overviewMeetingPinBadge.classList.remove("hidden");
            } else {
                overviewMeetingPinBadge.classList.add("hidden");
            }
        }

        // Left Panel - Card 1: Overview
        if (summaryContent) {
            summaryContent.textContent = data.summary || "No overview available.";
        }

        // Left Panel - Card 2: Key Discussion Points
        if (discussionPointsList) {
            discussionPointsList.innerHTML = "";
            (data.discussion_points || []).forEach(point => {
                const li = document.createElement("li");
                li.className = "flex items-start gap-2.5 leading-relaxed text-xs sm:text-sm";
                li.innerHTML = `
                    <span class="text-pink-500 font-bold shrink-0 mt-0.5">•</span>
                    <span>${escapeHtml(point)}</span>
                `;
                discussionPointsList.appendChild(li);
            });
        }

        // Left Panel - Card 3: Key Decisions
        if (decisionsList) {
            decisionsList.innerHTML = "";
            (data.decisions || []).forEach(dec => {
                const li = document.createElement("li");
                li.className = "flex items-start gap-2.5 leading-relaxed text-xs sm:text-sm";
                li.innerHTML = `
                    <span class="w-4 h-4 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 mt-0.5 border border-emerald-200 dark:border-emerald-900">
                        <svg class="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    </span>
                    <span>${escapeHtml(dec)}</span>
                `;
                decisionsList.appendChild(li);
            });
        }

        // Left Panel - Card 4: Action Items (Interactive Custom Checkboxes)
        renderActionCards(data.action_items || []);

        // Right Panel - Interactive Speaker Transcript
        currentUtterances = data.utterances && data.utterances.length > 0
            ? data.utterances
            : parseTranscriptTextToUtterances(data.transcript || "");
        renderTranscriptUtterances(currentUtterances);

        // Populate AI Insights panel highlights
        updateAiInsights(data);
    }

    // Render action items as interactive task cards with custom SVG checkboxes
    function renderActionCards(items) {
        if (!actionCardsContainer) return;
        actionCardsContainer.innerHTML = "";

        items.forEach(item => {
            appendActionCard(item.task, item.assignee, item.deadline, item.status);
        });

        updateActionCardCount();
    }

    function appendActionCard(task = "New Task", assignee = "Person 1", deadline = "Friday", status = "Pending") {
        if (!actionCardsContainer) return;
        const card = document.createElement("div");
        let isDone = (status === "Completed");
        card.className = `action-card p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800/90 bg-white dark:bg-slate-900/80 hover:border-slate-300 dark:hover:border-slate-700 transition-all flex items-start gap-3.5 group ${isDone ? "task-completed" : ""}`;

        card.innerHTML = `
            <button type="button" class="action-check-btn w-6 h-6 rounded-lg border-2 ${isDone ? "bg-pink-600 border-pink-600 text-white shadow-sm" : "border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 hover:border-pink-500 hover:scale-105 text-transparent"} flex items-center justify-center transition-all duration-150 shrink-0 mt-0.5 cursor-pointer focus:outline-none focus:ring-2 focus:ring-pink-500/20" aria-label="Toggle task status">
                <svg class="w-3.5 h-3.5 check-icon ${isDone ? "opacity-100 scale-100" : "opacity-0 scale-50"} transition-all duration-150" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/>
                </svg>
            </button>
            <div class="flex-1 overflow-hidden">
                <p class="task-text text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200 cursor-text leading-snug ${isDone ? "line-through text-slate-400 dark:text-slate-500" : ""}" contenteditable="true">${escapeHtml(task)}</p>
                <div class="flex flex-wrap items-center gap-2 mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                    <span class="inline-flex items-center gap-1 font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800/80 px-2 py-0.5 rounded-md border border-slate-200/60 dark:border-slate-700/60">
                        <svg class="w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
                        <span>${escapeHtml(assignee)}</span>
                    </span>
                    <span class="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/80 px-2 py-0.5 rounded-md border border-slate-200/60 dark:border-slate-700/60">
                        <svg class="w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                        <span>${escapeHtml(deadline)}</span>
                    </span>
                    <span class="status-badge ml-auto px-2.5 py-0.5 rounded-md font-semibold text-xs ${isDone ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20" : "bg-pink-500/10 text-pink-600 dark:text-pink-400 border border-pink-500/20"}">
                        ${isDone ? "Completed" : "Pending"}
                    </span>
                    <button type="button" class="delete-action-btn text-slate-400 hover:text-rose-500 p-0.5 rounded hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer" title="Delete Task">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    </button>
                </div>
            </div>
        `;

        const checkBtn = card.querySelector(".action-check-btn");
        const checkIcon = card.querySelector(".check-icon");
        const statusBadge = card.querySelector(".status-badge");
        const taskText = card.querySelector(".task-text");

        function toggleDone() {
            isDone = !isDone;
            if (isDone) {
                card.classList.add("task-completed");
                if (hideCompletedTasksToggle && hideCompletedTasksToggle.checked) {
                    card.style.display = "none";
                }
                checkBtn.className = "action-check-btn w-6 h-6 rounded-lg border-2 bg-pink-600 border-pink-600 text-white shadow-sm flex items-center justify-center transition-all duration-150 shrink-0 mt-0.5 cursor-pointer focus:outline-none focus:ring-2 focus:ring-pink-500/20";
                checkIcon.className = "w-3.5 h-3.5 check-icon opacity-100 scale-100 transition-all duration-150";
                taskText.className = "task-text text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200 cursor-text leading-snug line-through text-slate-400 dark:text-slate-500";
                statusBadge.textContent = "Completed";
                statusBadge.className = "status-badge ml-auto px-2.5 py-0.5 rounded-md font-semibold text-xs bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20";
                addActivityLog("Action item completed", taskText.textContent.trim() || "Action Item", "Just now", "indigo");
            } else {
                card.classList.remove("task-completed");
                card.style.display = "flex";
                checkBtn.className = "action-check-btn w-6 h-6 rounded-lg border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 hover:border-pink-500 hover:scale-105 text-transparent flex items-center justify-center transition-all duration-150 shrink-0 mt-0.5 cursor-pointer focus:outline-none focus:ring-2 focus:ring-pink-500/20";
                checkIcon.className = "w-3.5 h-3.5 check-icon opacity-0 scale-50 transition-all duration-150";
                taskText.className = "task-text text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200 cursor-text leading-snug";
                statusBadge.textContent = "Pending";
                statusBadge.className = "status-badge ml-auto px-2.5 py-0.5 rounded-md font-semibold text-xs bg-pink-500/10 text-pink-600 dark:text-pink-400 border border-pink-500/20";
            }
            updateActionCardCount();
        }

        checkBtn.addEventListener("click", toggleDone);
        card.querySelector(".delete-action-btn").addEventListener("click", () => {
            card.remove();
            updateActionCardCount();
        });

        if (isDone && hideCompletedTasksToggle && hideCompletedTasksToggle.checked) {
            card.style.display = "none";
        }

        actionCardsContainer.appendChild(card);
        updateActionCardCount();
    }

    if (addNewActionCardBtn) {
        addNewActionCardBtn.addEventListener("click", () => {
            appendActionCard("Describe task...", "Person 1", "Friday", "Pending");
        });
    }

    if (hideCompletedTasksToggle) {
        hideCompletedTasksToggle.addEventListener("change", () => {
            const hide = hideCompletedTasksToggle.checked;
            if (actionCardsContainer) {
                actionCardsContainer.querySelectorAll(".action-card.task-completed").forEach(card => {
                    card.style.display = hide ? "none" : "flex";
                });
            }
        });
    }

    function updateActionCardCount() {
        if (!actionCardsContainer) return;
        const total = actionCardsContainer.querySelectorAll(".action-card").length;
        const completed = actionCardsContainer.querySelectorAll(".action-card.task-completed").length;
        if (actionItemCountBadge) actionItemCountBadge.textContent = `${completed}/${total}`;
        const meetingTabActionBadge = document.getElementById("meetingTabActionBadge");
        if (meetingTabActionBadge) meetingTabActionBadge.textContent = `${completed}/${total}`;
    }

    // Parse fallback transcript text into generic utterances without speaker tags
    function parseTranscriptTextToUtterances(transcriptText) {
        if (!transcriptText) return [];
        const lines = transcriptText.split("\n").map(l => l.trim()).filter(Boolean);
        const utterances = [];

        lines.forEach((line, idx) => {
            let text = line;
            if (line.includes(":") && line.split(":")[0].trim().length < 25) {
                const parts = line.split(":");
                text = parts.slice(1).join(":").trim();
            }
            const secs = idx * 16 + 2;
            utterances.push({
                time: formatTime(secs),
                seconds: secs,
                text
            });
        });

        return utterances;
    }

    // Render interactive transcript with exact requested format:
    // TRANSCRIPT
    // 00:02
    // We need to discuss the project deadline...
    function renderTranscriptUtterances(utterances) {
        if (!transcriptUtterancesContainer) return;
        transcriptUtterancesContainer.innerHTML = "";

        if (!utterances || utterances.length === 0) {
            transcriptUtterancesContainer.innerHTML = `
                <p class="text-xs text-slate-400 text-center py-8">No transcript available.</p>
            `;
            return;
        }

        utterances.forEach(u => {
            const bubble = document.createElement("div");
            bubble.className = "utterance-bubble p-3.5 sm:p-4 rounded-xl border border-transparent hover:border-slate-200 dark:hover:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 hover:bg-slate-100/70 dark:hover:bg-slate-800/60 transition cursor-pointer group";
            bubble.setAttribute("data-seconds", u.seconds);

            bubble.innerHTML = `
                <div class="mb-1.5 flex items-center justify-between">
                    <button type="button" class="timestamp-seek-btn text-xs font-bold text-pink-600 dark:text-pink-400 hover:underline flex items-center gap-1.5 py-0.5 cursor-pointer" title="Play from ${u.time}" data-seconds="${u.seconds}">
                        <svg class="w-3 h-3 fill-current text-pink-500" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                        <span>${u.time}</span>
                    </button>
                </div>
                <p class="utterance-text text-xs sm:text-sm text-slate-800 dark:text-slate-200 leading-relaxed font-normal">
                    ${escapeHtml(u.text)}
                </p>
            `;

            // Clicking the timestamp button or the entire bubble seeks playback to this timestamp
            const seekBtn = bubble.querySelector(".timestamp-seek-btn");
            seekBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                seekAudioTo(u.seconds);
            });

            bubble.addEventListener("click", () => {
                seekAudioTo(u.seconds);
            });

            transcriptUtterancesContainer.appendChild(bubble);
        });
    }

    // Real-time transcript keyword search and filtering
    if (transcriptSearchInput && transcriptUtterancesContainer) {
        transcriptSearchInput.addEventListener("input", (e) => {
            const query = e.target.value.toLowerCase().trim();
            const bubbles = transcriptUtterancesContainer.querySelectorAll(".utterance-bubble");

            bubbles.forEach(bubble => {
                const textEl = bubble.querySelector(".utterance-text");
                const text = textEl ? textEl.textContent : "";
                if (!query) {
                    bubble.style.display = "";
                    if (textEl) textEl.innerHTML = escapeHtml(text);
                } else if (text.toLowerCase().includes(query)) {
                    bubble.style.display = "";
                    const regex = new RegExp(`(${escapeRegex(query)})`, "gi");
                    if (textEl) {
                        textEl.innerHTML = escapeHtml(text).replace(regex, `<mark class="bg-amber-200 dark:bg-amber-900/80 rounded px-0.5">$1</mark>`);
                    }
                } else {
                    bubble.style.display = "none";
                }
            });
        });
    }

    // Copy full structured transcript (Timing on own line, no speaker names)
    if (copyTranscriptBtn) {
        copyTranscriptBtn.addEventListener("click", () => {
            if (!currentUtterances || currentUtterances.length === 0) return;
            const text = currentUtterances.map(u => `${u.time}\n${u.text}`).join("\n\n");
            navigator.clipboard.writeText(text).then(() => {
                const original = copyTranscriptBtn.innerHTML;
                copyTranscriptBtn.innerHTML = `<span>Copied!</span>`;
                setTimeout(() => { copyTranscriptBtn.innerHTML = original; }, 2000);
            });
        });
    }

    // Export Modal Controls and Actions
    const openExportModalBtn = document.getElementById("openExportModalBtn");
    const exportModal = document.getElementById("exportModal");
    const closeExportModalBtn = document.getElementById("closeExportModalBtn");
    const modalExportPdfBtn = document.getElementById("modalExportPdfBtn");
    const modalExportDocxBtn = document.getElementById("modalExportDocxBtn");

    const exportOptSummary = document.getElementById("exportOptSummary");
    const exportOptDecisions = document.getElementById("exportOptDecisions");
    const exportOptActionItems = document.getElementById("exportOptActionItems");
    const exportOptTranscript = document.getElementById("exportOptTranscript");

    function openExportModal() {
        if (exportModal) exportModal.classList.remove("hidden");
    }

    function closeExportModal() {
        if (exportModal) exportModal.classList.add("hidden");
    }

    if (openExportModalBtn) {
        openExportModalBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            openExportModal();
        });
    }

    if (closeExportModalBtn) {
        closeExportModalBtn.addEventListener("click", closeExportModal);
    }

    if (exportModal) {
        exportModal.addEventListener("click", (e) => {
            if (e.target === exportModal) {
                closeExportModal();
            }
        });
    }

    function getSelectedExportSections() {
        return {
            summary: exportOptSummary ? exportOptSummary.checked : true,
            decisions: exportOptDecisions ? exportOptDecisions.checked : true,
            action_items: exportOptActionItems ? exportOptActionItems.checked : true,
            transcript: exportOptTranscript ? exportOptTranscript.checked : true,
            speakers: false
        };
    }

    if (modalExportPdfBtn) {
        modalExportPdfBtn.addEventListener("click", () => {
            downloadDocumentExport("pdf", getSelectedExportSections());
            closeExportModal();
        });
    }

    if (modalExportDocxBtn) {
        modalExportDocxBtn.addEventListener("click", () => {
            downloadDocumentExport("docx", getSelectedExportSections());
            closeExportModal();
        });
    }

    // Trigger selective server-side ReportLab PDF or python-docx export
    function downloadDocumentExport(fileFormat, sections = null) {
        const meetingData = prepareExportPayload();
        const payload = {
            data: meetingData,
            sections: sections || {
                summary: true,
                decisions: true,
                action_items: true,
                transcript: true,
                speakers: false
            }
        };

        fetch(`/export/${fileFormat}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        })
        .then(res => {
            if (!res.ok) throw new Error("Export generation failed.");
            return res.blob();
        })
        .then(blob => {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            const base = (meetingData.filename || "Meeting").replace(/\.[^/.]+$/, "").replace(/[\s_-]+/g, "_");
            a.download = `${base}_minutes.${fileFormat}`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
            const exportTitle = (meetingData.filename || "Meeting").replace(/\.[^/.]+$/, "").replace(/[\s_-]+/g, " ");
            addActivityLog("Minutes exported", exportTitle, "Just now", "blue");
        })
        .catch(err => {
            alert(`Could not export file: ${err.message}`);
        });
    }

    function prepareExportPayload() {
        const actionItems = [];
        if (actionCardsContainer) {
            actionCardsContainer.querySelectorAll(".action-card").forEach(card => {
                const task = card.querySelector(".task-text")?.textContent.trim() || "";
                const isDone = card.classList.contains("task-completed");
                actionItems.push({
                    task,
                    assignee: "Person 1",
                    deadline: "Friday",
                    status: isDone ? "Completed" : "Pending"
                });
            });
        }

        return {
            filename: currentMeetingData?.filename || "Project_Planning_Meeting.mp3",
            file_size: currentMeetingData?.file_size || "14.2 MB",
            statistics: currentMeetingData?.statistics || { duration: "18m 42s", word_count: 142, language: "English" },
            summary: summaryContent ? summaryContent.textContent : (currentMeetingData?.summary || ""),
            discussion_points: currentMeetingData?.discussion_points || [],
            decisions: currentMeetingData?.decisions || [],
            action_items: actionItems.length ? actionItems : (currentMeetingData?.action_items || []),
            utterances: currentUtterances || [],
            transcript: currentMeetingData?.transcript || ""
        };
    }

    // AI Insights & Assistant Q&A Panel Logic
    const aiInsightsBulletList = document.getElementById("aiInsightsBulletList");
    const aiAskForm = document.getElementById("aiAskForm");
    const aiAskInput = document.getElementById("aiAskInput");
    const aiAnswerBox = document.getElementById("aiAnswerBox");
    const aiAnswerText = document.getElementById("aiAnswerText");
    const aiAnswerSourceBadge = document.getElementById("aiAnswerSourceBadge");
    const closeAiAnswerBtn = document.getElementById("closeAiAnswerBtn");

    function updateAiInsights(data) {
        if (!aiInsightsBulletList) return;
        aiInsightsBulletList.innerHTML = "";

        const bullets = [];
        const actionItems = data.action_items || [];
        if (actionItems.length > 0 && actionItems[0].deadline) {
            bullets.push(`The project deadline is ${actionItems[0].deadline}.`);
        } else {
            bullets.push("The project deadline is Friday.");
        }

        const decisions = data.decisions || [];
        if (decisions.length > 0) {
            bullets.push(`${decisions[0]}.`);
        } else {
            bullets.push("API integration is the main remaining dependency.");
        }

        if (actionItems.length > 0) {
            bullets.push(`${actionItems.length} tasks were assigned across the team.`);
        } else {
            bullets.push("3 tasks were assigned across the team.");
        }

        bullets.forEach(bText => {
            const li = document.createElement("li");
            li.className = "flex items-start gap-2";
            li.innerHTML = `
                <span class="text-pink-600 dark:text-pink-400 font-bold shrink-0 mt-0.5">&bull;</span>
                <span class="ai-insight-bullet">${escapeHtml(bText)}</span>
            `;
            aiInsightsBulletList.appendChild(li);
        });

        if (aiAnswerBox) aiAnswerBox.classList.add("hidden");
        if (aiAskInput) aiAskInput.value = "";
    }

    if (closeAiAnswerBtn && aiAnswerBox) {
        closeAiAnswerBtn.addEventListener("click", () => {
            aiAnswerBox.classList.add("hidden");
        });
    }

    if (aiAskForm && aiAskInput) {
        aiAskForm.addEventListener("submit", (e) => {
            e.preventDefault();
            const query = aiAskInput.value.trim();
            if (!query) return;

            if (aiAnswerBox) {
                aiAnswerBox.classList.remove("hidden");
                if (aiAnswerSourceBadge) aiAnswerSourceBadge.textContent = "Analyzing...";
                if (aiAnswerText) aiAnswerText.textContent = "Reviewing meeting context and transcript...";
            }

            const payload = {
                question: query,
                meeting_data: prepareExportPayload()
            };

            fetch("/api/ask_ai", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            })
            .then(res => res.json())
            .then(result => {
                if (result.status === "success") {
                    if (aiAnswerBox) aiAnswerBox.classList.remove("hidden");
                    if (aiAnswerSourceBadge) aiAnswerSourceBadge.textContent = result.source || "Meeting Assistant";
                    if (aiAnswerText) aiAnswerText.textContent = result.answer;
                } else {
                    if (aiAnswerText) aiAnswerText.textContent = result.error || "Unable to answer query.";
                }
            })
            .catch(err => {
                if (aiAnswerText) aiAnswerText.textContent = `Could not reach AI assistant: ${err.message}`;
            });
        });
    }



    // Audio Playback Speed Control (Cycles 1.0x -> 1.25x -> 1.5x -> 2.0x -> 0.75x)
    const audioSpeedBtn = document.getElementById("audioSpeedBtn");
    const audioSpeeds = [1.0, 1.25, 1.5, 2.0, 0.75];
    let currentSpeedIdx = 0;
    if (audioSpeedBtn && audioPreview) {
        audioSpeedBtn.addEventListener("click", () => {
            currentSpeedIdx = (currentSpeedIdx + 1) % audioSpeeds.length;
            const speed = audioSpeeds[currentSpeedIdx];
            audioPreview.playbackRate = speed;
            audioSpeedBtn.textContent = `${speed}x`;
        });
    }

    // Meeting Workspace Pill Tab Switcher (No Split View)
    const meetingTabBtns = document.querySelectorAll(".meeting-tab-btn");
    const meetingPaneSummary = document.getElementById("meetingPaneSummary");
    const meetingPaneInsights = document.getElementById("meetingPaneInsights");
    const meetingPaneActions = document.getElementById("meetingPaneActions");
    const meetingPaneTranscript = document.getElementById("meetingPaneTranscript");

    function switchMeetingTab(tabKey) {
        meetingTabBtns.forEach(btn => {
            const key = btn.getAttribute("data-meeting-tab");
            if (key === tabKey) {
                btn.className = "meeting-tab-btn theme-pill active inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition cursor-pointer";
            } else {
                btn.className = "meeting-tab-btn text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition cursor-pointer";
            }
        });

        const panes = [meetingPaneSummary, meetingPaneInsights, meetingPaneActions, meetingPaneTranscript];
        panes.forEach(p => { if (p) p.classList.add("hidden"); });

        if (tabKey === "summary" && meetingPaneSummary) {
            meetingPaneSummary.classList.remove("hidden");
        } else if (tabKey === "insights" && meetingPaneInsights) {
            meetingPaneInsights.classList.remove("hidden");
        } else if (tabKey === "actions" && meetingPaneActions) {
            meetingPaneActions.classList.remove("hidden");
        } else if (tabKey === "transcript" && meetingPaneTranscript) {
            meetingPaneTranscript.classList.remove("hidden");
        }
    }

    meetingTabBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            const key = btn.getAttribute("data-meeting-tab");
            if (key) switchMeetingTab(key);
        });
    });

    // Quick AI prompt chips
    document.querySelectorAll(".quick-ask-chip").forEach(chip => {
        chip.addEventListener("click", () => {
            if (aiAskInput && aiAskForm) {
                aiAskInput.value = chip.textContent.trim();
                aiAskForm.dispatchEvent(new Event("submit"));
            }
        });
    });



    async function openSavedMeeting(meeting) {
        if (!meeting) return;
        let fullMeeting = meeting;
        if (meeting.db_id && !meeting.summary && !meeting.transcript && (!Array.isArray(meeting.action_items) || meeting.action_items.length === 0)) {
            try {
                const res = await fetch(`/api/meetings/${meeting.db_id}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data && data.meeting) {
                        fullMeeting = data.meeting;
                    }
                }
            } catch (e) {}
        }

        if (typeof window.switchView === "function") {
            window.switchView("viewWorkspace");
        }

        const stats = fullMeeting.statistics || {};
        const transcriptText = fullMeeting.transcript || "";
        const wordCount = stats.word_count || (transcriptText.trim() ? transcriptText.trim().split(/\s+/).length : 0);

        const payload = {
            ...fullMeeting,
            _historyMeetingId: fullMeeting.id || (fullMeeting.db_id ? `db-${fullMeeting.db_id}` : null),
            filename: fullMeeting.filename || fullMeeting.title || "Meeting_Transcript.mp3",
            summary: fullMeeting.summary || fullMeeting.description || "No summary available for this meeting.",
            discussion_points: Array.isArray(fullMeeting.discussion_points) ? fullMeeting.discussion_points : [],
            decisions: Array.isArray(fullMeeting.decisions) ? fullMeeting.decisions : [],
            action_items: Array.isArray(fullMeeting.action_items) ? fullMeeting.action_items : [],
            utterances: Array.isArray(fullMeeting.utterances) ? fullMeeting.utterances : [],
            transcript: transcriptText,
            statistics: {
                duration: stats.duration || fullMeeting.duration || "0m",
                word_count: wordCount,
                language: stats.language || "English"
            }
        };

        renderTwoPanelWorkspace(payload);
    }

// Expose workspace functions globally and on window.Meetly
    window.renderTwoPanelWorkspace = renderTwoPanelWorkspace;
    window.resetNewMeetingWorkspace = resetNewMeetingWorkspace;
    window.prepareExportPayload = prepareExportPayload;
    window.openSavedMeeting = openSavedMeeting;

    window.Meetly.renderTwoPanelWorkspace = renderTwoPanelWorkspace;
    window.Meetly.resetNewMeetingWorkspace = resetNewMeetingWorkspace;
    window.Meetly.prepareExportPayload = prepareExportPayload;
    window.Meetly.openSavedMeeting = openSavedMeeting;
});
