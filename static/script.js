document.addEventListener("DOMContentLoaded", () => {
    // Input elements
    const fileInput = document.getElementById("meetingFileInput");
    const dropZone = document.getElementById("dropZone");
    const fileDetailsBar = document.getElementById("fileDetailsBar");
    const fileNameDisplay = document.getElementById("fileNameDisplay");
    const fileSizeDisplay = document.getElementById("fileSizeDisplay");
    const audioPreview = document.getElementById("audioPreview");
    const startPipelineBtn = document.getElementById("startPipelineBtn");
    const clearFileBtn = document.getElementById("clearFileBtn");

    // Stepper & Progress elements
    const pipelineProgress = document.getElementById("pipelineProgress");
    const progressBarFill = document.getElementById("progressBarFill");
    const progressPercentage = document.getElementById("progressPercentage");
    const currentStatusText = document.getElementById("currentStatusText");

    const stageUpload = document.getElementById("stageUpload");
    const stageASR = document.getElementById("stageASR");
    const stageNLP = document.getElementById("stageNLP");
    const stageStructure = document.getElementById("stageStructure");

    // Output elements
    const minutesOutputContainer = document.getElementById("minutesOutputContainer");
    const kpiDuration = document.getElementById("kpiDuration");
    const kpiWordCount = document.getElementById("kpiWordCount");
    const kpiDecisions = document.getElementById("kpiDecisions");
    const kpiTasks = document.getElementById("kpiTasks");

    const summaryContent = document.getElementById("summaryContent");
    const discussionPointsList = document.getElementById("discussionPointsList");
    const decisionsList = document.getElementById("decisionsList");
    const actionTableBody = document.getElementById("actionTableBody");
    const addRowBtn = document.getElementById("addRowBtn");

    const rawTranscriptText = document.getElementById("rawTranscriptText");
    const transcriptSearch = document.getElementById("transcriptSearch");
    const copyTranscriptOnlyBtn = document.getElementById("copyTranscriptOnlyBtn");

    // Export buttons
    const exportPdfBtn = document.getElementById("exportPdfBtn");
    const exportDocxBtn = document.getElementById("exportDocxBtn");
    const copyAllMinutesBtn = document.getElementById("copyAllMinutesBtn");

    // Tab buttons
    const tabButtons = document.querySelectorAll(".tab-btn");
    const tabContents = document.querySelectorAll(".tab-content");

    let currentMeetingData = null;
    let audioObjectUrl = null;

    // -------------------------------------------------------------
    // File Selection & Audio Preview
    // -------------------------------------------------------------
    fileInput.addEventListener("change", () => {
        if (fileInput.files.length > 0) {
            handleFileSelection(fileInput.files[0]);
        }
    });

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
            handleFileSelection(e.dataTransfer.files[0]);
        }
    });

    function handleFileSelection(file) {
        if (!file) return;

        const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
        fileNameDisplay.textContent = file.name;
        fileSizeDisplay.textContent = `${sizeMb} MB &bull; ${file.type || "Audio"}`;

        // Create browser object URL for native audio playback
        if (audioObjectUrl) {
            URL.revokeObjectURL(audioObjectUrl);
        }
        audioObjectUrl = URL.createObjectURL(file);
        audioPreview.src = audioObjectUrl;

        fileDetailsBar.style.display = "flex";
        clearFileBtn.style.display = "inline-flex";
        startPipelineBtn.disabled = false;
    }

    clearFileBtn.addEventListener("click", () => {
        fileInput.value = "";
        if (audioObjectUrl) {
            URL.revokeObjectURL(audioObjectUrl);
            audioObjectUrl = null;
        }
        audioPreview.pause();
        audioPreview.removeAttribute("src");

        fileDetailsBar.style.display = "none";
        clearFileBtn.style.display = "none";
        startPipelineBtn.disabled = true;
        pipelineProgress.style.display = "none";
        minutesOutputContainer.style.display = "none";
    });

    // -------------------------------------------------------------
    // Pipeline Progress & Execution
    // -------------------------------------------------------------
    startPipelineBtn.addEventListener("click", async () => {
        if (!fileInput.files.length) return;

        const file = fileInput.files[0];
        const formData = new FormData();
        formData.append("meeting_file", file);

        startPipelineBtn.disabled = true;
        pipelineProgress.style.display = "block";
        minutesOutputContainer.style.display = "none";

        resetStepper();
        setStep(15, "Uploading meeting audio recording to server...", stageUpload);

        try {
            const uploadPromise = fetch("/upload", {
                method: "POST",
                body: formData
            });

            await delay(600);
            setStep(40, "Decoding audio and running Whisper speech recognition...", stageASR);

            await delay(900);
            setStep(70, "Processing conversational transcript with NLP summarizer...", stageNLP);

            await delay(800);
            setStep(90, "Extracting decisions, action items, assignees & deadlines...", stageStructure);

            const response = await uploadPromise;
            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || "Failed to process audio.");
            }

            await delay(400);
            setStep(100, "Meeting minutes successfully compiled!", stageStructure, true);

            currentMeetingData = result.data;

            setTimeout(() => {
                renderMinutes(currentMeetingData);
                minutesOutputContainer.style.display = "block";
                minutesOutputContainer.scrollIntoView({ behavior: "smooth" });
                startPipelineBtn.disabled = false;
            }, 400);

        } catch (err) {
            console.error("Execution error:", err);
            setStep(0, `Error: ${err.message}`);
            progressBarFill.style.backgroundColor = "#ef4444";
            startPipelineBtn.disabled = false;
        }
    });

    function setStep(percent, statusMsg, activeNode = null, isFinal = false) {
        progressBarFill.style.width = `${percent}%`;
        progressPercentage.textContent = `${percent}%`;
        currentStatusText.textContent = statusMsg;

        if (activeNode) {
            document.querySelectorAll(".step-node").forEach(node => {
                if (node === activeNode) {
                    node.classList.add(isFinal ? "completed" : "active");
                } else if (node.compareDocumentPosition(activeNode) & Node.DOCUMENT_POSITION_FOLLOWING) {
                    node.classList.add("completed");
                    node.classList.remove("active");
                }
            });
        }
    }

    function resetStepper() {
        progressBarFill.style.width = "0%";
        progressBarFill.style.backgroundColor = "";
        progressPercentage.textContent = "0%";
        document.querySelectorAll(".step-node").forEach(n => {
            n.classList.remove("active", "completed");
        });
        stageUpload.classList.add("active");
    }

    // -------------------------------------------------------------
    // Data Rendering
    // -------------------------------------------------------------
    function renderMinutes(data) {
        const stats = data.statistics || {};
        kpiDuration.textContent = stats.duration || "--";
        kpiWordCount.textContent = stats.word_count || "--";
        kpiDecisions.textContent = stats.decisions_count || "--";
        kpiTasks.textContent = stats.action_items_count || "--";

        // Summary
        summaryContent.textContent = data.summary || "No summary available.";

        // Discussion Points
        discussionPointsList.innerHTML = "";
        (data.discussion_points || []).forEach(pt => {
            const li = document.createElement("li");
            li.textContent = pt;
            discussionPointsList.appendChild(li);
        });

        // Decisions
        decisionsList.innerHTML = "";
        (data.decisions || []).forEach(dec => {
            const li = document.createElement("li");
            li.textContent = dec;
            decisionsList.appendChild(li);
        });

        // Action items table
        renderActionTable(data.action_items || []);

        // Transcript
        rawTranscriptText.textContent = data.transcript || "No transcript available.";
    }

    function renderActionTable(items) {
        actionTableBody.innerHTML = "";
        items.forEach((item, index) => {
            appendTableRow(item.task, item.assignee, item.deadline, item.status);
        });
    }

    function appendTableRow(task = "New Task", assignee = "Unassigned", deadline = "None", status = "Pending") {
        const tr = document.createElement("tr");
        const statusClass = status === "In Progress" ? "status-in-progress" : (status === "Completed" ? "status-done" : "status-pending");

        tr.innerHTML = `
            <td class="editable-cell" contenteditable="true">${escapeHtml(task)}</td>
            <td class="editable-cell" contenteditable="true">${escapeHtml(assignee)}</td>
            <td class="editable-cell" contenteditable="true">${escapeHtml(deadline)}</td>
            <td>
                <span class="status-pill ${statusClass}">${escapeHtml(status)}</span>
            </td>
            <td style="text-align: center;">
                <button type="button" class="btn-icon-danger delete-row-btn" title="Delete item">&times;</button>
            </td>
        `;

        tr.querySelector(".delete-row-btn").addEventListener("click", () => {
            tr.remove();
            updateTaskCount();
        });

        actionTableBody.appendChild(tr);
        updateTaskCount();
    }

    addRowBtn.addEventListener("click", () => {
        appendTableRow("Describe action item...", "Name", "Date/Time", "Pending");
    });

    function updateTaskCount() {
        kpiTasks.textContent = actionTableBody.querySelectorAll("tr").length;
    }

    // -------------------------------------------------------------
    // Tabs Navigation
    // -------------------------------------------------------------
    tabButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            tabButtons.forEach(b => b.classList.remove("active"));
            tabContents.forEach(c => c.classList.remove("active"));

            btn.classList.add("active");
            const targetId = btn.getAttribute("data-tab");
            document.getElementById(targetId).classList.add("active");
        });
    });

    // -------------------------------------------------------------
    // Search in Transcript
    // -------------------------------------------------------------
    transcriptSearch.addEventListener("input", (e) => {
        const query = e.target.value.toLowerCase();
        const text = rawTranscriptText.textContent;
        if (!query) {
            rawTranscriptText.textContent = text;
            return;
        }
    });

    copyTranscriptOnlyBtn.addEventListener("click", () => {
        navigator.clipboard.writeText(rawTranscriptText.textContent).then(() => {
            copyTranscriptOnlyBtn.textContent = "Copied!";
            setTimeout(() => { copyTranscriptOnlyBtn.textContent = "Copy Text"; }, 2000);
        });
    });

    // -------------------------------------------------------------
    // Live Edited Document Export (PDF & DOCX)
    // -------------------------------------------------------------
    function collectCurrentLiveMinutes() {
        const discussionPoints = [];
        discussionPointsList.querySelectorAll("li").forEach(li => {
            if (li.textContent.trim()) discussionPoints.push(li.textContent.trim());
        });

        const decisions = [];
        decisionsList.querySelectorAll("li").forEach(li => {
            if (li.textContent.trim()) decisions.push(li.textContent.trim());
        });

        const actionItems = [];
        actionTableBody.querySelectorAll("tr").forEach(tr => {
            const cells = tr.querySelectorAll("td");
            if (cells.length >= 4) {
                actionItems.push({
                    task: cells[0].textContent.trim(),
                    assignee: cells[1].textContent.trim(),
                    deadline: cells[2].textContent.trim(),
                    status: cells[3].textContent.trim()
                });
            }
        });

        return {
            filename: fileNameDisplay.textContent || "meeting_minutes",
            statistics: {
                duration: kpiDuration.textContent,
                word_count: kpiWordCount.textContent,
                decisions_count: decisions.length,
                action_items_count: actionItems.length
            },
            summary: summaryContent.textContent.trim(),
            discussion_points: discussionPoints,
            decisions: decisions,
            action_items: actionItems,
            transcript: rawTranscriptText.textContent.trim()
        };
    }

    async function triggerExport(format) {
        const liveData = collectCurrentLiveMinutes();
        const btn = format === "pdf" ? exportPdfBtn : exportDocxBtn;
        const originalText = btn.innerHTML;
        btn.innerHTML = "Generating...";

        try {
            const response = await fetch(`/export/${format}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(liveData)
            });

            if (!response.ok) throw new Error("Export failed.");

            const blob = await response.blob();
            const downloadUrl = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = downloadUrl;
            a.download = `meeting_minutes.${format}`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(downloadUrl);
        } catch (err) {
            alert(`Could not export ${format.toUpperCase()}: ${err.message}`);
        } finally {
            btn.innerHTML = originalText;
        }
    }

    exportPdfBtn.addEventListener("click", () => triggerExport("pdf"));
    exportDocxBtn.addEventListener("click", () => triggerExport("docx"));

    copyAllMinutesBtn.addEventListener("click", () => {
        const data = collectCurrentLiveMinutes();
        let formatted = `MINUTES OF MEETING\nFile: ${data.filename}\nDuration: ${data.statistics.duration}\n\n1. EXECUTIVE SUMMARY\n${data.summary}\n\n2. KEY DISCUSSION POINTS\n`;
        data.discussion_points.forEach(p => formatted += `• ${p}\n`);
        formatted += `\n3. DECISIONS MADE\n`;
        data.decisions.forEach(d => formatted += `• ${d}\n`);
        formatted += `\n4. ACTION ITEMS\n`;
        data.action_items.forEach(a => formatted += `• [${a.status}] ${a.task} - Assignee: ${a.assignee} (Due: ${a.deadline})\n`);

        navigator.clipboard.writeText(formatted).then(() => {
            copyAllMinutesBtn.textContent = "Copied!";
            setTimeout(() => { copyAllMinutesBtn.textContent = "Copy All"; }, 2000);
        });
    });

    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function escapeHtml(str) {
        if (!str) return "";
        const div = document.createElement("div");
        div.textContent = str;
        return div.innerHTML;
    }
});
