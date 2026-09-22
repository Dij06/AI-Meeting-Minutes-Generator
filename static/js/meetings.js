/**
 * Meetly - Meetings Archive Module (static/js/meetings.js)
 * Handles Meetings Store (localStorage), Search & Multi-Filters (Date, Duration, Actions, Decisions),
 * Compact Spacing Toggle, Tag Organization (#Project, #Team, Custom Tags),
 * Rename / Tag Modals, Pinning, Delete, and Text Export.
 */

window.Meetly = window.Meetly || {};

document.addEventListener("DOMContentLoaded", () => {
    // Unified Meeting Store & Dynamic Dashboard Metrics
    const DEFAULT_MEETINGS_DATA = [
        {
            id: "m-1",
            title: "Project Discussion",
            date: "Today",
            fullDate: "18 September 2026",
            dayOfWeek: "Wed",
            duration: "42 min",
            durationMinutes: 42,
            audioSize: "Audio: 12.4 MB",
            tags: ["Project"],
            pinned: true,
            actionsCount: 8,
            actionsBreakdown: { open: 4, completed: 3, pending: 1 },
            decisionsCount: 5,
            category: "today",
            description: "Architecture & sprint roadmap",
            transcript: "Let's review the frontend architecture and deployment pipeline for the meeting summarizer. We need the Whisper transcription model and LLM extraction integrated by Friday."
        },
        {
            id: "m-2",
            title: "Team Meeting",
            date: "Yesterday",
            fullDate: "17 September 2026",
            dayOfWeek: "Tue",
            duration: "31 min",
            durationMinutes: 31,
            audioSize: "Audio: 8.7 MB",
            tags: ["Team"],
            pinned: false,
            actionsCount: 4,
            actionsBreakdown: { open: 2, completed: 1, pending: 1 },
            decisionsCount: 3,
            category: "week",
            description: "Weekly sprint review & blockers",
            transcript: "Good morning team, let's go over the sprint progress, API response times, and UI component refactor. Testing coverage has increased to 92%."
        },
        {
            id: "m-3",
            title: "Client Discussion",
            date: "15 Sep",
            fullDate: "15 September 2026",
            dayOfWeek: "Mon",
            duration: "52 min",
            durationMinutes: 52,
            audioSize: "Audio: 16.1 MB",
            tags: ["Client"],
            pinned: false,
            actionsCount: 6,
            actionsBreakdown: { open: 3, completed: 2, pending: 1 },
            decisionsCount: 4,
            category: "month",
            description: "Deliverables & feature sign-off",
            transcript: "Welcome everyone. In this session we are reviewing the client deliverables, audio upload specifications, and security compliance sign-off."
        }
    ];



    function getStoredMeetings() {
        try {
            const raw = localStorage.getItem("meetly_cached_meetings");
            if (raw !== null) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    // Backwards compatibility migration
                    return parsed.map(m => ({
                        ...m,
                        tags: Array.isArray(m.tags) ? m.tags : ["Project"],
                        pinned: typeof m.pinned === "boolean" ? m.pinned : false,
                        audioSize: m.audioSize || "Audio: 12.4 MB",
                        fullDate: m.fullDate || m.date || "18 September 2026",
                        transcript: m.transcript || m.description || ""
                    }));
                }
            }
            localStorage.setItem("meetly_cached_meetings", JSON.stringify(DEFAULT_MEETINGS_DATA));
            return DEFAULT_MEETINGS_DATA;
        } catch (e) {
            console.error("Error reading meetings cache:", e);
            return [];
        }
    }

    function saveStoredMeetings(meetings) {
        try {
            localStorage.setItem("meetly_cached_meetings", JSON.stringify(meetings));
        } catch (e) {
            console.error("Error saving meetings cache:", e);
        }
    }

    function recordNewMeetingIntoHistory(data) {
        if (!data) return;
        const meetings = getStoredMeetings();
        const rawName = data.filename || "New Meeting Recording";
        const title = rawName.replace(/\.[^/.]+$/, "").replace(/^[0-9]+_/, "").replace(/_/g, " ");
        
        const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        const todayDay = days[new Date().getDay()] || "Wed";

        let durMins = 15;
        const durStr = data.statistics?.duration || "15m";
        const numMatch = durStr.match(/(\d+)/);
        if (numMatch) {
            durMins = parseInt(numMatch[1], 10);
        }

        const actions = data.action_items || [];
        const decisions = data.decisions || [];
        const today = new Date();
        const fullDate = today.toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" });
        const audioSize = data.file_size ? `Audio: ${data.file_size}` : (data.audioSize || "Audio: 12.4 MB");

        const newMeeting = {
            id: "m-" + Date.now(),
            title: title || "Project Sync",
            date: "Today",
            fullDate: fullDate,
            dayOfWeek: ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(todayDay) ? todayDay : "Wed",
            duration: `${durMins} min`,
            durationMinutes: durMins,
            audioSize: audioSize,
            tags: ["Project"],
            pinned: false,
            actionsCount: actions.length || 3,
            actionsBreakdown: {
                open: actions.length || 3,
                completed: 0,
                pending: 0
            },
            decisionsCount: decisions.length || 2,
            category: "today",
            description: "Audio transcription & AI extraction",
            transcript: data.transcript || ""
        };

        meetings.unshift(newMeeting);
        saveStoredMeetings(meetings);
        addActivityLog("Meeting processed", newMeeting.title, "Just now", "emerald");
        renderDashboardMetrics();
        renderMeetingsList();
    }



    function openRenameModal(id, currentTitle) {
        if (!renameMeetingModal) return;
        if (renameMeetingId) renameMeetingId.value = id;
        if (renameMeetingInput) {
            renameMeetingInput.value = currentTitle;
            setTimeout(() => renameMeetingInput.focus(), 50);
        }
        renameMeetingModal.classList.remove("hidden");
    }

    function closeRenameModal() {
        if (renameMeetingModal) renameMeetingModal.classList.add("hidden");
    }

    if (closeRenameModalBtn) closeRenameModalBtn.addEventListener("click", closeRenameModal);
    if (cancelRenameBtn) cancelRenameBtn.addEventListener("click", closeRenameModal);

    if (saveRenameBtn) {
        saveRenameBtn.addEventListener("click", () => {
            const id = renameMeetingId ? renameMeetingId.value : "";
            const newTitle = renameMeetingInput ? renameMeetingInput.value.trim() : "";
            if (!newTitle) return;

            const meetings = getStoredMeetings();
            const target = meetings.find(m => m.id === id);
            if (target) {
                target.title = newTitle;
                saveStoredMeetings(meetings);
                addActivityLog("Meeting renamed", newTitle, "Just now", "blue");
                renderDashboardMetrics();
                renderMeetingsList();

                // If currently viewing in workspace, update titles
                if (resultMeetingTitle) resultMeetingTitle.textContent = newTitle;
                const overviewMeetingTitle = document.getElementById("overviewMeetingTitle");
                if (overviewMeetingTitle) overviewMeetingTitle.textContent = newTitle;
            }
            closeRenameModal();
        });
    }

    // Tag Management & Dynamic User Tag Creation
    const DEFAULT_AVAILABLE_TAGS = ["Project", "College", "Team", "Client"];

    function getStoredTags() {
        try {
            const raw = localStorage.getItem("meetly_available_tags");
            let tags = raw !== null ? JSON.parse(raw) : [...DEFAULT_AVAILABLE_TAGS];
            if (!Array.isArray(tags)) tags = [...DEFAULT_AVAILABLE_TAGS];
            DEFAULT_AVAILABLE_TAGS.forEach(t => {
                if (!tags.includes(t)) tags.push(t);
            });
            // Merge tags existing in meetings
            const meetings = getStoredMeetings();
            meetings.forEach(m => {
                if (Array.isArray(m.tags)) {
                    m.tags.forEach(t => {
                        if (t && !tags.some(existing => existing.toLowerCase() === t.toLowerCase())) {
                            tags.push(t);
                        }
                    });
                }
            });
            return tags;
        } catch (e) {
            return [...DEFAULT_AVAILABLE_TAGS];
        }
    }

    function saveStoredTags(tags) {
        try {
            localStorage.setItem("meetly_available_tags", JSON.stringify(tags));
        } catch (e) {
            console.error("Error saving tags cache:", e);
        }
    }

    function createNewTag(rawName) {
        if (!rawName) return null;
        let clean = rawName.trim().replace(/^#+/, "").trim();
        if (!clean) return null;
        clean = clean.charAt(0).toUpperCase() + clean.slice(1);

        const tags = getStoredTags();
        const existing = tags.find(t => t.toLowerCase() === clean.toLowerCase());
        if (!existing) {
            tags.push(clean);
            saveStoredTags(tags);
            addActivityLog("Tag created", `#${clean}`, "Just now", "purple");
        } else {
            clean = existing;
        }
        renderTagFilterPills();
        return clean;
    }

    function renderTagFilterPills() {
        const container = document.getElementById("tagFilterPillsContainer");
        if (!container) return;
        container.innerHTML = "";

        const allTags = ["all", ...getStoredTags()];

        allTags.forEach(tag => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.setAttribute("data-tag-pill", tag);
            const isAll = tag === "all";
            const label = isAll ? "#All" : `#${tag}`;
            const isActive = activeTagPill === tag;

            btn.className = isActive
                ? "meeting-tag-pill theme-pill active px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer select-none"
                : "meeting-tag-pill text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer select-none";
            btn.textContent = label;

            btn.addEventListener("click", () => {
                activeTagPill = tag;
                renderTagFilterPills();
                renderMeetingsList();
            });

            container.appendChild(btn);
        });
    }

    function openTagModal(id, currentTags = []) {
        if (!addTagModal) return;
        if (tagMeetingId) tagMeetingId.value = id;
        if (customTagInput) customTagInput.value = "";

        const listContainer = document.getElementById("modalAvailableTagsList");
        if (listContainer) {
            listContainer.innerHTML = "";
            const tags = getStoredTags();
            tags.forEach(t => {
                const btn = document.createElement("button");
                btn.type = "button";
                btn.setAttribute("data-tag-select", t);
                const isSelected = currentTags.includes(t);
                btn.className = isSelected
                    ? "tag-select-btn px-3 py-1.5 rounded-xl text-xs font-semibold theme-pill active transition cursor-pointer select-none"
                    : "tag-select-btn px-3 py-1.5 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-blue-500 transition cursor-pointer select-none";
                btn.textContent = `#${t}`;

                btn.addEventListener("click", () => {
                    listContainer.querySelectorAll(".tag-select-btn").forEach(b => {
                        b.className = "tag-select-btn px-3 py-1.5 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-blue-500 transition cursor-pointer select-none";
                    });
                    btn.className = "tag-select-btn px-3 py-1.5 rounded-xl text-xs font-semibold theme-pill active transition cursor-pointer select-none";
                    if (customTagInput) customTagInput.value = t;
                });

                listContainer.appendChild(btn);
            });
        }

        addTagModal.classList.remove("hidden");
    }

    function closeTagModal() {
        if (addTagModal) addTagModal.classList.add("hidden");
    }

    if (closeTagModalBtn) closeTagModalBtn.addEventListener("click", closeTagModal);
    if (cancelTagBtn) cancelTagBtn.addEventListener("click", closeTagModal);

    if (saveTagBtn) {
        saveTagBtn.addEventListener("click", () => {
            const id = tagMeetingId ? tagMeetingId.value : "";
            let chosenTag = customTagInput ? customTagInput.value.trim().replace(/^#+/, "").trim() : "";
            if (!chosenTag) {
                const activeBtn = document.querySelector("#modalAvailableTagsList .tag-select-btn.active");
                if (activeBtn) chosenTag = activeBtn.getAttribute("data-tag-select");
            }
            if (!chosenTag) chosenTag = "Project";

            // If user typed a custom tag, add it to available tags store
            const cleanTag = createNewTag(chosenTag) || chosenTag;

            const meetings = getStoredMeetings();
            const target = meetings.find(m => m.id === id);
            if (target) {
                target.tags = [cleanTag];
                saveStoredMeetings(meetings);
                addActivityLog("Tag updated", `${target.title} #${cleanTag}`, "Just now", "purple");
                renderMeetingsList();

                const overviewMeetingTagBadge = document.getElementById("overviewMeetingTagBadge");
                if (overviewMeetingTagBadge) overviewMeetingTagBadge.textContent = `#${cleanTag}`;
            }
            closeTagModal();
        });
    }

    // Create New Tag Modal Handlers & Idea Suggestions Interaction
    function openCreateTagModal() {
        if (!createTagModal) return;
        if (newTagNameInput) {
            newTagNameInput.value = "";
            setTimeout(() => newTagNameInput.focus(), 60);
        }
        // Reset active highlight on idea chips
        document.querySelectorAll("#createTagModal .tag-idea-chip").forEach(chip => {
            chip.classList.remove("theme-pill", "active", "border-blue-500", "text-blue-600", "dark:text-blue-400");
        });
        createTagModal.classList.remove("hidden");
    }

    function closeCreateTagModal() {
        if (createTagModal) createTagModal.classList.add("hidden");
    }

    if (addNewCustomTagBtn) addNewCustomTagBtn.addEventListener("click", openCreateTagModal);
    if (closeCreateTagModalBtn) closeCreateTagModalBtn.addEventListener("click", closeCreateTagModal);
    if (cancelCreateTagBtn) cancelCreateTagBtn.addEventListener("click", closeCreateTagModal);

    // Clicking any tag idea chip automatically fills input & highlights chip
    document.querySelectorAll("#createTagModal .tag-idea-chip").forEach(chip => {
        chip.addEventListener("click", () => {
            const idea = chip.getAttribute("data-tag-idea") || chip.textContent.replace(/^#+/, "").trim();
            if (newTagNameInput) {
                newTagNameInput.value = idea;
                newTagNameInput.focus();
            }
            document.querySelectorAll("#createTagModal .tag-idea-chip").forEach(c => {
                c.classList.remove("theme-pill", "active", "border-blue-500", "text-blue-600", "dark:text-blue-400");
            });
            chip.classList.add("theme-pill", "active", "border-blue-500", "text-blue-600", "dark:text-blue-400");
        });
    });

    if (saveCreateTagBtn) {
        saveCreateTagBtn.addEventListener("click", () => {
            const raw = newTagNameInput ? newTagNameInput.value.trim() : "";
            if (!raw) {
                if (newTagNameInput) newTagNameInput.focus();
                return;
            }
            const clean = createNewTag(raw);
            if (clean) {
                activeTagPill = clean;
                renderTagFilterPills();
                renderMeetingsList();
            }
            closeCreateTagModal();
        });
    }

    if (newTagNameInput) {
        newTagNameInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                if (saveCreateTagBtn) saveCreateTagBtn.click();
            }
        });
    }

    function toggleMeetingPin(id) {
        const meetings = getStoredMeetings();
        const target = meetings.find(m => m.id === id);
        if (target) {
            target.pinned = !target.pinned;
            saveStoredMeetings(meetings);
            addActivityLog(target.pinned ? "Meeting pinned" : "Meeting unpinned", target.title, "Just now", "amber");
            renderMeetingsList();

            const overviewMeetingPinBadge = document.getElementById("overviewMeetingPinBadge");
            if (overviewMeetingPinBadge) {
                if (target.pinned) overviewMeetingPinBadge.classList.remove("hidden");
                else overviewMeetingPinBadge.classList.add("hidden");
            }
        }
    }

    function deleteMeeting(id) {
        const meetings = getStoredMeetings();
        const target = meetings.find(m => m.id === id);
        if (!target) return;

        if (confirm(`Are you sure you want to delete "${target.title}"?`)) {
            const updated = meetings.filter(m => m.id !== id);
            saveStoredMeetings(updated);
            addActivityLog("Meeting deleted", target.title, "Just now", "rose");
            renderDashboardMetrics();
            renderMeetingsList();
        }
    }

    function downloadMeetingSummaryText(meeting) {
        const title = meeting.title || "Meeting Minutes";
        const lines = [
            `# ${title}`,
            `Date: ${meeting.fullDate || meeting.date || "18 September 2026"}`,
            `Duration: ${meeting.duration || "42 min"}`,
            `Audio: ${meeting.audioSize || "12.4 MB"}`,
            `Tags: ${(meeting.tags || ["Project"]).join(", ")}`,
            "",
            "## Summary",
            meeting.description || "Meeting audio transcribed and analyzed.",
            "",
            "## Transcript Excerpt",
            meeting.transcript || "No transcript preview available."
        ];

        const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${title.replace(/\s+/g, "_")}_minutes.md`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        addActivityLog("Minutes exported", title, "Just now", "blue");
    }

    // Top Overview Card action hooks
    const overviewRenameBtn = document.getElementById("overviewRenameBtn");
    if (overviewRenameBtn) {
        overviewRenameBtn.addEventListener("click", () => {
            const currentTitle = resultMeetingTitle ? resultMeetingTitle.textContent : "Project Discussion";
            const meetings = getStoredMeetings();
            const firstMeeting = meetings[0] || { id: "m-1" };
            openRenameModal(firstMeeting.id, currentTitle);
        });
    }

    const overviewTagBtn = document.getElementById("overviewTagBtn");
    if (overviewTagBtn) {
        overviewTagBtn.addEventListener("click", () => {
            const meetings = getStoredMeetings();
            const firstMeeting = meetings[0] || { id: "m-1", tags: ["Project"] };
            openTagModal(firstMeeting.id, firstMeeting.tags || ["Project"]);
        });
    }

    function renderMeetingsList() {
        if (!meetingCardsList) return;
        meetingCardsList.innerHTML = "";

        const query = (meetingSearchInput ? meetingSearchInput.value : "").toLowerCase().trim();
        const storedMeetings = getStoredMeetings();

        // 1. Filter
        const filtered = storedMeetings.filter(m => {
            // Search query against title, date, fullDate, transcript, description
            const matchName = m.title && m.title.toLowerCase().includes(query);
            const matchDate = (m.date && m.date.toLowerCase().includes(query)) || (m.fullDate && m.fullDate.toLowerCase().includes(query));
            const matchTranscript = (m.transcript && m.transcript.toLowerCase().includes(query)) || (m.description && m.description.toLowerCase().includes(query));
            const matchesQuery = !query || matchName || matchDate || matchTranscript;

            // Date filter: all, week, month
            let matchesDate = true;
            if (activeDateFilter === "week") {
                matchesDate = (m.date && (m.date.toLowerCase() === "today" || m.date.toLowerCase() === "yesterday" || m.category === "week"));
            } else if (activeDateFilter === "month") {
                matchesDate = true; // All meetings in current sample are within this month
            }

            // Tag pill filter: all, Project, College, Team, Client
            let matchesTag = true;
            if (activeTagPill !== "all") {
                matchesTag = m.tags && m.tags.includes(activeTagPill);
            }

            // Duration filter: under15, 15to30, over30
            let matchesDuration = true;
            const dur = m.durationMinutes || 15;
            if (activeDurationFilter === "under15") matchesDuration = dur < 15;
            else if (activeDurationFilter === "15to30") matchesDuration = dur >= 15 && dur <= 30;
            else if (activeDurationFilter === "over30") matchesDuration = dur > 30;

            // Has actions / Has decisions checkboxes
            let matchesActions = true;
            if (filterHasActionsOnly) matchesActions = (m.actionsCount || 0) > 0;

            let matchesDecisions = true;
            if (filterHasDecisionsOnly) matchesDecisions = (m.decisionsCount || 0) > 0;

            return matchesQuery && matchesDate && matchesTag && matchesDuration && matchesActions && matchesDecisions;
        });

        // 2. Sort: Pinned meetings always appear on top, then user sort order
        filtered.sort((a, b) => {
            if (a.pinned && !b.pinned) return -1;
            if (!a.pinned && b.pinned) return 1;

            if (activeSortOrder === "newest") {
                return (b.id || "").localeCompare(a.id || "");
            } else if (activeSortOrder === "oldest") {
                return (a.id || "").localeCompare(b.id || "");
            } else if (activeSortOrder === "duration") {
                return (b.durationMinutes || 0) - (a.durationMinutes || 0);
            } else if (activeSortOrder === "actions") {
                return (b.actionsCount || 0) - (a.actionsCount || 0);
            }
            return 0;
        });

        if (filtered.length === 0) {
            if (noMeetingsFound) noMeetingsFound.classList.remove("hidden");
            return;
        } else {
            if (noMeetingsFound) noMeetingsFound.classList.add("hidden");
        }

        // 3. Render meeting cards
        filtered.forEach((m, idx) => {
            const card = document.createElement("div");
            card.className = "meeting-card relative p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#0d121f] border border-slate-200/80 dark:border-slate-800/90 shadow-xs hover:border-blue-500/40 hover:shadow-sm transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 group";
            card.setAttribute("data-meeting-id", m.id);

            const palette = [
                { bg: "bg-blue-50 dark:bg-blue-950/60", text: "text-blue-600 dark:text-blue-400" },
                { bg: "bg-purple-50 dark:bg-purple-950/60", text: "text-purple-600 dark:text-purple-400" },
                { bg: "bg-emerald-50 dark:bg-emerald-950/60", text: "text-emerald-600 dark:text-emerald-400" }
            ];
            const theme = palette[idx % palette.length];
            const primaryTag = (m.tags && m.tags.length > 0) ? m.tags[0] : "Project";

            card.innerHTML = `
                <!-- Left: Meeting info -->
                <div class="flex items-start gap-3.5 min-w-0">
                    <div class="meeting-avatar w-10 h-10 rounded-xl ${theme.bg} ${theme.text} flex items-center justify-center shrink-0 mt-0.5 group-hover:scale-105 transition">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-14 0m14 0a7 7 0 01-14 0m7 7v4m-4 0h8m-4-11a3 3 0 003-3V5a3 3 0 10-6 0v6a3 3 0 003 3z"/></svg>
                    </div>
                    <div class="space-y-1 overflow-hidden">
                        <div class="flex items-center gap-2 flex-wrap">
                            ${m.pinned ? `
                                <span class="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 px-2 py-0.5 rounded-md border border-amber-200/80 dark:border-amber-900/60 select-none">
                                    <svg class="w-3 h-3 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/></svg>
                                    <span>Important Meeting</span>
                                </span>
                            ` : ''}
                            <span class="inline-flex items-center text-[11px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded-md border border-blue-200/80 dark:border-blue-900/60 select-none">#${escapeHtml(primaryTag)}</span>
                        </div>
                        <h3 class="text-sm sm:text-base font-bold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition truncate cursor-pointer meeting-title-click">
                            ${escapeHtml(m.title)}
                        </h3>
                        <div class="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
                            <span>${escapeHtml(m.fullDate || m.date)}</span>
                            <span>&bull;</span>
                            <span>${escapeHtml(m.duration)}</span>
                            <span>&bull;</span>
                            <span>${escapeHtml(m.audioSize || "Audio: 12.4 MB")}</span>
                        </div>
                    </div>
                </div>

                <!-- Right: Action items pill, decisions pill, workspace arrow, and 3-dot dropdown menu -->
                <div class="flex items-center justify-between sm:justify-end gap-2.5 sm:gap-4 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-slate-800/60">
                    <div class="flex items-center gap-1.5">
                        <span class="px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200/80 dark:border-blue-900/60 text-xs font-semibold">
                            ${m.actionsCount || 0} actions
                        </span>
                        <span class="px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200/80 dark:border-emerald-900/60 text-xs font-semibold">
                            ${m.decisionsCount || 0} decisions
                        </span>
                    </div>

                    <div class="flex items-center gap-1.5 relative">
                        <!-- Open workspace arrow -->
                        <button type="button" class="open-workspace-btn w-8 h-8 rounded-xl bg-slate-50 dark:bg-slate-800/80 hover:bg-blue-600 dark:hover:bg-blue-600 text-slate-400 hover:text-white flex items-center justify-center transition shadow-xs cursor-pointer" title="Open Meeting Workspace">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
                        </button>

                        <!-- 3-dot organization menu button -->
                        <button type="button" class="meeting-menu-trigger w-8 h-8 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition cursor-pointer" title="More options">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"/></svg>
                        </button>

                        <!-- Dropdown Menu -->
                        <div class="meeting-dropdown-menu hidden absolute right-0 top-10 w-44 bg-white dark:bg-[#0d121f] border border-slate-200/90 dark:border-slate-800 rounded-xl shadow-xl py-1 z-30 animate-in fade-in duration-100">
                            <button type="button" class="menu-action-rename w-full text-left px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80 flex items-center gap-2 transition">
                                <svg class="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                                <span>Rename</span>
                            </button>
                            <button type="button" class="menu-action-tag w-full text-left px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80 flex items-center gap-2 transition">
                                <svg class="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"/></svg>
                                <span>Add Tag</span>
                            </button>
                            <button type="button" class="menu-action-pin w-full text-left px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80 flex items-center gap-2 transition">
                                <svg class="w-3.5 h-3.5 ${m.pinned ? 'text-amber-500' : 'text-slate-400'}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/></svg>
                                <span>${m.pinned ? 'Unpin Meeting' : 'Pin Meeting'}</span>
                            </button>
                            <button type="button" class="menu-action-download w-full text-left px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80 flex items-center gap-2 transition">
                                <svg class="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                                <span>Download</span>
                            </button>
                            <div class="my-1 border-t border-slate-100 dark:border-slate-800"></div>
                            <button type="button" class="menu-action-delete w-full text-left px-3.5 py-2 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center gap-2 transition">
                                <svg class="w-3.5 h-3.5 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                                <span>Delete</span>
                            </button>
                        </div>
                    </div>
                </div>
            `;

            // Card click & workspace trigger
            const openAction = () => {
                switchView("viewWorkspace");
                loadDemoMeeting();
            };
            card.querySelector(".meeting-title-click").addEventListener("click", openAction);
            card.querySelector(".open-workspace-btn").addEventListener("click", openAction);

            // Dropdown menu toggle
            const trigger = card.querySelector(".meeting-menu-trigger");
            const dropdown = card.querySelector(".meeting-dropdown-menu");

            trigger.addEventListener("click", (e) => {
                e.stopPropagation();
                // Close any other open menus
                document.querySelectorAll(".meeting-dropdown-menu").forEach(d => {
                    if (d !== dropdown) d.classList.add("hidden");
                });
                dropdown.classList.toggle("hidden");
            });

            // Action handlers in dropdown
            card.querySelector(".menu-action-rename").addEventListener("click", (e) => {
                e.stopPropagation();
                dropdown.classList.add("hidden");
                openRenameModal(m.id, m.title);
            });

            card.querySelector(".menu-action-tag").addEventListener("click", (e) => {
                e.stopPropagation();
                dropdown.classList.add("hidden");
                openTagModal(m.id, m.tags || ["Project"]);
            });

            card.querySelector(".menu-action-pin").addEventListener("click", (e) => {
                e.stopPropagation();
                dropdown.classList.add("hidden");
                toggleMeetingPin(m.id);
            });

            card.querySelector(".menu-action-download").addEventListener("click", (e) => {
                e.stopPropagation();
                dropdown.classList.add("hidden");
                downloadMeetingSummaryText(m);
            });

            card.querySelector(".menu-action-delete").addEventListener("click", (e) => {
                e.stopPropagation();
                dropdown.classList.add("hidden");
                deleteMeeting(m.id);
            });

            meetingCardsList.appendChild(card);
        });
    }

    // Close open dropdowns when clicking outside
    document.addEventListener("click", () => {
        document.querySelectorAll(".meeting-dropdown-menu").forEach(d => d.classList.add("hidden"));
    });

    // Wire search input
    if (meetingSearchInput) {
        meetingSearchInput.addEventListener("input", () => {
            renderMeetingsList();
        });
    }

    // Wire Sort Select
    if (meetingSortSelect) {
        meetingSortSelect.addEventListener("change", () => {
            activeSortOrder = meetingSortSelect.value;
            renderMeetingsList();
        });
    }

    // Wire Duration Filter
    if (meetingDurationSelect) {
        meetingDurationSelect.addEventListener("change", () => {
            activeDurationFilter = meetingDurationSelect.value;
            renderMeetingsList();
        });
    }

    // Wire Filter Chips (Has Action Items & Has Decisions)
    if (filterHasActionsChip) {
        filterHasActionsChip.addEventListener("click", () => {
            filterHasActionsOnly = !filterHasActionsOnly;
            filterHasActionsChip.classList.toggle("active", filterHasActionsOnly);
            renderMeetingsList();
        });
    }

    if (filterHasDecisionsChip) {
        filterHasDecisionsChip.addEventListener("click", () => {
            filterHasDecisionsOnly = !filterHasDecisionsOnly;
            filterHasDecisionsChip.classList.toggle("active", filterHasDecisionsOnly);
            renderMeetingsList();
        });
    }

    // Wire Compact Meeting Cards Toggle
    if (compactMeetingsToggle) {
        const isCompact = localStorage.getItem("meetly_compact_meetings") === "1";
        compactMeetingsToggle.checked = isCompact;
        if (meetingCardsList && isCompact) meetingCardsList.classList.add("meeting-cards-compact");

        compactMeetingsToggle.addEventListener("change", () => {
            if (meetingCardsList) {
                meetingCardsList.classList.toggle("meeting-cards-compact", compactMeetingsToggle.checked);
            }
            localStorage.setItem("meetly_compact_meetings", compactMeetingsToggle.checked ? "1" : "0");
        });
    }

    // Wire Date Filter Dropdown
    if (meetingDateSelect) {
        meetingDateSelect.addEventListener("change", () => {
            activeDateFilter = meetingDateSelect.value;
            renderMeetingsList();
        });
    }

    // Initial render of dashboard metrics, dynamic tag filter pills, and meeting cards
    try {
        renderDashboardMetrics();
    } catch (e) {
        console.error("Error rendering dashboard metrics:", e);
    }
    try {
        renderTagFilterPills();
    } catch (e) {
        console.error("Error rendering tag filter pills:", e);
    }
    try {
        renderMeetingsList();
    } catch (e) {
        console.error("Error rendering meetings list:", e);
    }



// Expose meetings functions globally and on window.Meetly
    window.getStoredMeetings = getStoredMeetings;
    window.saveStoredMeetings = saveStoredMeetings;
    window.recordNewMeetingIntoHistory = recordNewMeetingIntoHistory;
    window.renderMeetingsList = renderMeetingsList;
    window.renderTagFilterPills = renderTagFilterPills;
    window.getStoredTags = getStoredTags;
    window.openRenameModal = openRenameModal;
    window.openTagModal = openTagModal;
    window.openCreateTagModal = openCreateTagModal;

    window.Meetly.getStoredMeetings = getStoredMeetings;
    window.Meetly.saveStoredMeetings = saveStoredMeetings;
    window.Meetly.recordNewMeetingIntoHistory = recordNewMeetingIntoHistory;
    window.Meetly.renderMeetingsList = renderMeetingsList;
    window.Meetly.renderTagFilterPills = renderTagFilterPills;
    window.Meetly.getStoredTags = getStoredTags;
    window.Meetly.openRenameModal = openRenameModal;
    window.Meetly.openTagModal = openTagModal;
    window.Meetly.openCreateTagModal = openCreateTagModal;
});
