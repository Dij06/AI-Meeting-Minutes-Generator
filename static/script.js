document.addEventListener("DOMContentLoaded", () => {
    const fileInput = document.getElementById("meetingFile");
    const dropZone = document.getElementById("dropZone");
    const generateBtn = document.getElementById("generateBtn");
    const resetBtn = document.getElementById("resetBtn");
    const selectedFileName = document.getElementById("selectedFileName");

    // Progress elements
    const progressSection = document.getElementById("progressSection");
    const progressBar = document.getElementById("progressBar");
    const progressPercent = document.getElementById("progressPercent");
    const progressStatus = document.getElementById("progressStatus");

    const stepUpload = document.getElementById("stepUpload");
    const stepASR = document.getElementById("stepASR");
    const stepNLP = document.getElementById("stepNLP");
    const stepStructure = document.getElementById("stepStructure");

    // Result elements
    const resultsWrapper = document.getElementById("resultsWrapper");
    const statDuration = document.getElementById("statDuration");
    const statWordCount = document.getElementById("statWordCount");
    const statDecisions = document.getElementById("statDecisions");
    const statActionItems = document.getElementById("statActionItems");

    const summaryBox = document.getElementById("summaryBox");
    const discussionList = document.getElementById("discussionList");
    const decisionsList = document.getElementById("decisionsList");
    const actionItemsBody = document.getElementById("actionItemsBody");
    const transcriptBox = document.getElementById("transcriptBox");

    const copyTranscriptBtn = document.getElementById("copyTranscriptBtn");
    const pdfBtn = document.getElementById("pdfBtn");
    const docxBtn = document.getElementById("docxBtn");

    let currentMeetingData = null;

    // File selection
    fileInput.addEventListener("change", () => {
        handleFileSelect(fileInput.files[0]);
    });

    // Drag and drop handlers
    dropZone.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropZone.classList.add("dragover");
    });

    dropZone.addEventListener("dragleave", () => {
        dropZone.classList.remove("dragover");
    });

    dropZone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropZone.classList.remove("dragover");
        if (e.dataTransfer.files.length > 0) {
            fileInput.files = e.dataTransfer.files;
            handleFileSelect(e.dataTransfer.files[0]);
        }
    });

    function handleFileSelect(file) {
        if (!file) {
            selectedFileName.textContent = "No file selected";
            generateBtn.disabled = true;
            return;
        }
        const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
        selectedFileName.textContent = `${file.name} (${sizeMb} MB)`;
        generateBtn.disabled = false;
        resetBtn.style.display = "inline-block";
    }

    resetBtn.addEventListener("click", () => {
        fileInput.value = "";
        selectedFileName.textContent = "No file selected";
        generateBtn.disabled = true;
        resetBtn.style.display = "none";
        progressSection.style.display = "none";
        resultsWrapper.style.display = "none";
    });

    // Generate Minutes with Percentage Progression
    generateBtn.addEventListener("click", async () => {
        if (!fileInput.files.length) return;

        const file = fileInput.files[0];
        const formData = new FormData();
        formData.append("meeting_file", file);

        generateBtn.disabled = true;
        progressSection.style.display = "block";
        resultsWrapper.style.display = "none";

        // Progress stage simulation
        updateProgress(15, "Uploading meeting audio recording...", stepUpload);

        try {
            // Upload to server
            const uploadPromise = fetch("/upload", {
                method: "POST",
                body: formData
            });

            // Simulate progress ticks while server processes
            await delay(600);
            updateProgress(35, "Converting audio format and initializing Whisper ASR...", stepASR);

            await delay(900);
            updateProgress(65, "Transcribing speech and analyzing conversational context...", stepASR);

            await delay(900);
            updateProgress(85, "Running NLP summarizer and extracting key decisions...", stepNLP);

            const response = await uploadPromise;
            const resData = await response.json();

            if (!response.ok) {
                throw new Error(resData.error || "Failed to process audio.");
            }

            await delay(500);
            updateProgress(95, "Structuring action items, assignees, and deadlines...", stepStructure);

            await delay(400);
            updateProgress(100, "Meeting minutes successfully generated!", stepStructure, true);

            currentMeetingData = resData.data;

            // Render Results
            setTimeout(() => {
                renderResults(currentMeetingData);
                resultsWrapper.style.display = "block";
                resultsWrapper.scrollIntoView({ behavior: "smooth" });
                generateBtn.disabled = false;
            }, 500);

        } catch (error) {
            console.error("Processing error:", error);
            updateProgress(0, `Error: ${error.message}`);
            progressBar.style.backgroundColor = "#ef4444";
            generateBtn.disabled = false;
        }
    });

    function updateProgress(percent, statusMessage, activeBadge = null, isComplete = false) {
        progressBar.style.width = `${percent}%`;
        progressPercent.textContent = `${percent}%`;
        progressStatus.textContent = statusMessage;

        if (activeBadge) {
            document.querySelectorAll(".step-badge").forEach(badge => badge.classList.remove("active"));
            activeBadge.classList.add(isComplete ? "completed" : "active");
        }
    }

    function renderResults(data) {
        // Statistics
        const stats = data.statistics || {};
        statDuration.textContent = stats.duration || "--";
        statWordCount.textContent = stats.word_count || "--";
        statDecisions.textContent = stats.decisions_count || "--";
        statActionItems.textContent = stats.action_items_count || "--";

        // Summary
        summaryBox.textContent = data.summary || "No summary extracted.";

        // Discussion Points
        discussionList.innerHTML = "";
        (data.discussion_points || []).forEach(point => {
            const li = document.createElement("li");
            li.textContent = point;
            discussionList.appendChild(li);
        });

        // Decisions Made
        decisionsList.innerHTML = "";
        (data.decisions || []).forEach(decision => {
            const li = document.createElement("li");
            li.textContent = decision;
            decisionsList.appendChild(li);
        });

        // Action Items Table
        actionItemsBody.innerHTML = "";
        (data.action_items || []).forEach(item => {
            const tr = document.createElement("tr");
            const statusClass = item.status === "In Progress" ? "badge-progress" : "badge-pending";

            tr.innerHTML = `
                <td><strong>${escapeHtml(item.task)}</strong></td>
                <td>${escapeHtml(item.assignee || "Unassigned")}</td>
                <td>${escapeHtml(item.deadline || "None")}</td>
                <td><span class="badge ${statusClass}">${escapeHtml(item.status || "Pending")}</span></td>
            `;
            actionItemsBody.appendChild(tr);
        });

        // Transcript
        transcriptBox.textContent = data.transcript || "No transcript available.";
    }

    // Copy Transcript
    copyTranscriptBtn.addEventListener("click", () => {
        if (!transcriptBox.textContent) return;
        navigator.clipboard.writeText(transcriptBox.textContent).then(() => {
            copyTranscriptBtn.textContent = "Copied!";
            setTimeout(() => {
                copyTranscriptBtn.textContent = "Copy Text";
            }, 2000);
        });
    });

    // Export PDF
    pdfBtn.addEventListener("click", () => {
        window.location.href = "/export/pdf";
    });

    // Export DOCX
    docxBtn.addEventListener("click", () => {
        window.location.href = "/export/docx";
    });

    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function escapeHtml(text) {
        if (!text) return "";
        const div = document.createElement("div");
        div.textContent = text;
        return div.innerHTML;
    }
});
