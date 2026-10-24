/* ==========================================================================
   DagoOS — Challenge Module
   --------------------------------------------------------------------------
   Full feature: create challenges, track days, view stats, close challenges.
   ========================================================================== */

import {
  listDocs, addDoc, updateDoc, deleteDoc
} from "../core/firestore.js";
import {
  scoreDay, dayColor, currentStreak, longestStreak, overallAccuracy,
  todayISO, formatISO, enumerateDates
} from "../services/challenge-engine.js";
import { el, clear, formatDate } from "../core/utils.js";


/* --------------------------------------------------------------------------
   1. STATE
   -------------------------------------------------------------------------- */
const state = {
  challenges: [],
  activeChallenge: null,
  days: [],              // days of the active challenge
  expandedChallengeId: null,
  editingTasks: false
};

let refs = {};


/* --------------------------------------------------------------------------
   2. ENTRY POINT
   -------------------------------------------------------------------------- */
export async function initChallenge() {
  cacheRefs();
  bindForm();
  bindModal();
  await loadChallenges();
  render();
}


function cacheRefs() {
  refs = {
    list:          document.getElementById("challenge-list"),
    empty:         document.getElementById("challenge-empty"),

    // Create form (inline on page)
    createBtn:     document.getElementById("challenge-create"),

    // Detail view (hidden until a challenge is picked)
    detail:        document.getElementById("challenge-detail"),

    // Create modal
    modal:         document.getElementById("challenge-modal"),
    modalClose:    document.getElementById("challenge-modal-close"),
    form:          document.getElementById("challenge-form"),
    name:          document.getElementById("challenge-name"),
    duration:      document.getElementById("challenge-duration"),
    startDate:     document.getElementById("challenge-start"),
    tasksList:     document.getElementById("challenge-tasks"),
    taskInput:     document.getElementById("challenge-task-input"),
    taskAddBtn:    document.getElementById("challenge-task-add"),
    submit:        document.getElementById("challenge-submit")
  };

  if (refs.startDate && !refs.startDate.value) {
    refs.startDate.value = todayISO();
  }
}


/* --------------------------------------------------------------------------
   3. LOAD
   -------------------------------------------------------------------------- */
async function loadChallenges() {
  try {
    state.challenges = await listDocs("challenges", {
      orderByField: "createdAt",
      orderDir: "desc"
    });
  } catch (err) {
    console.error("[Challenge] Load failed:", err);
    state.challenges = [];
  }
}


async function loadDays(challengeId) {
  try {
    const all = await listDocs("challengeDays", {
      orderByField: "date",
      orderDir: "asc"
    });
    state.days = all.filter(d => d.challengeId === challengeId);
  } catch (err) {
    console.error("[Challenge] Days load failed:", err);
    state.days = [];
  }
}


/* --------------------------------------------------------------------------
   4. RENDER — top-level
   -------------------------------------------------------------------------- */
function render() {
  renderList();
  renderDetail();
}


function renderList() {
  if (!refs.list) return;
  clear(refs.list);

  if (state.challenges.length === 0) {
    refs.empty?.classList.remove("hidden");
    return;
  }
  refs.empty?.classList.add("hidden");

  for (const c of state.challenges) {
    refs.list.appendChild(buildChallengeCard(c));
  }
}


function buildChallengeCard(c) {
  const days = state.days.filter(d => d.challengeId === c.id);
  const stats = overallAccuracy(c, days);

  const statusBadge = el("span", {
    class: `challenge-status challenge-status--${c.status}`,
    text: c.status.toUpperCase()
  });

  const progress = c.status === "active"
    ? `${stats.daysElapsed} / ${stats.totalDays} days`
    : c.finalScore != null
      ? `${c.finalScore}% accuracy`
      : "";

  return el("div", {
    class: "challenge-card"
      + (state.activeChallenge?.id === c.id ? " is-active" : ""),
    onclick: () => openChallenge(c)
  },
    el("div", { class: "challenge-card__header" },
      el("div", { class: "challenge-card__title", text: c.name }),
      statusBadge
    ),
    el("div", { class: "challenge-card__meta" },
      el("span", { text: `${c.tasks?.length || 0} tasks` }),
      el("span", { text: " · " }),
      el("span", { text: progress })
    )
  );
}


/* --------------------------------------------------------------------------
   5. DETAIL VIEW
   -------------------------------------------------------------------------- */
async function openChallenge(c) {
  state.activeChallenge = c;
  await loadDays(c.id);
  render();
}


function renderDetail() {
  if (!refs.detail) return;
  const c = state.activeChallenge;
  if (!c) {
    refs.detail.classList.add("hidden");
    return;
  }

  refs.detail.classList.remove("hidden");
  clear(refs.detail);

  // Header
  refs.detail.appendChild(
    el("div", { class: "challenge-detail__header" },
      el("h2", { class: "challenge-detail__title", text: c.name }),
      el("div", { class: "challenge-detail__dates",
        text: `${formatDate(c.startDate)} → ${formatDate(endDate(c))}` })
    )
  );

  // Stats row
  const stats = overallAccuracy(c, state.days);
  const streak = currentStreak(state.days, c.tasks);
  const longest = longestStreak(state.days, c.tasks);

  refs.detail.appendChild(
    el("div", { class: "challenge-stats" },
      buildStat("Accuracy", `${stats.accuracy}%`),
      buildStat("Days elapsed", `${stats.daysElapsed} / ${stats.totalDays}`),
      buildStat("Current streak", `${streak}`),
      buildStat("Longest streak", `${longest}`)
    )
  );

  // Grid
  refs.detail.appendChild(
    el("div", { class: "challenge-section" },
      el("div", { class: "challenge-section__title", text: "Days" }),
      buildGrid(c)
    )
  );

  // Selected day editor
  refs.detail.appendChild(
    el("div", { class: "challenge-section" },
      el("div", { class: "challenge-section__title", text: "Today" }),
      buildTodayEditor(c)
    )
  );

  // Close / reopen actions
  const actions = el("div", { class: "challenge-actions" });
  if (c.status === "active") {
    actions.appendChild(el("button", {
      class: "btn btn--ghost btn--sm",
      type: "button",
      text: "Close challenge",
      onclick: () => closeChallenge(c)
    }));
  } else {
    actions.appendChild(el("button", {
      class: "btn btn--ghost btn--sm",
      type: "button",
      text: "Reopen challenge",
      onclick: () => reopenChallenge(c)
    }));
  }
  actions.appendChild(el("button", {
    class: "btn btn--danger btn--sm",
    type: "button",
    text: "Delete challenge",
    onclick: () => deleteChallenge(c)
  }));
  refs.detail.appendChild(actions);
}


function buildStat(label, value) {
  return el("div", { class: "challenge-stat" },
    el("div", { class: "challenge-stat__label", text: label }),
    el("div", { class: "challenge-stat__value", text: value })
  );
}


function buildGrid(c) {
  const dates = enumerateDates(c.startDate, c.durationDays);
  const byDate = {};
  for (const d of state.days) byDate[d.date] = d;

  const grid = el("div", { class: "challenge-grid" });
  const today = todayISO();

  for (const iso of dates) {
    const day = byDate[iso];
    const { score, markedCount } = day
      ? scoreDay(day.statuses, c.tasks)
      : { score: 0, markedCount: 0 };
    const color = dayColor(score, markedCount);
    const isToday = iso === today;
    const isFuture = iso > today;

    const cell = el("div", {
      class: `challenge-cell challenge-cell--${color}`
        + (isToday ? " is-today" : "")
        + (isFuture ? " is-future" : ""),
      title: `${formatDate(iso)}${markedCount > 0 ? " · " + scorePercent(score) : ""}`
    });
    grid.appendChild(cell);
  }

  return grid;
}


function buildTodayEditor(c) {
  const today = todayISO();
  const startDate = c.startDate;
  const endDateISO = endDate(c);

  const wrap = el("div", { class: "challenge-today" });

  // Before the challenge starts
  if (today < startDate) {
    const daysUntil = Math.round(
      (new Date(startDate) - new Date(today)) / (1000 * 60 * 60 * 24)
    );
    wrap.appendChild(
      el("div", { class: "challenge-today__notice" },
        el("div", { class: "challenge-today__notice-title",
          text: "Challenge hasn't started yet" }),
        el("div", { class: "challenge-today__notice-text",
          text: `Starts ${formatDate(startDate)} — that's ${daysUntil === 1 ? "tomorrow" : `in ${daysUntil} days`}.` })
      )
    );
    return wrap;
  }

  // After the challenge ends
  if (today > endDateISO) {
    wrap.appendChild(
      el("div", { class: "challenge-today__notice" },
        el("div", { class: "challenge-today__notice-title",
          text: "Challenge ended" }),
        el("div", { class: "challenge-today__notice-text",
          text: `Ended ${formatDate(endDateISO)}. Close the challenge to see your final accuracy.` })
      )
    );
    return wrap;
  }

  // Inside the challenge — normal editor
  const existing = state.days.find(d => d.date === today);
  const statuses = existing?.statuses || {};

  for (const task of c.tasks) {
    const current = statuses[task] || null;

    const row = el("div", { class: "challenge-today__row" },
      el("div", { class: "challenge-today__task", text: task }),
      el("div", { class: "challenge-today__statuses" })
    );

    const statusesEl = row.querySelector(".challenge-today__statuses");

    for (const [value, label] of [
      ["full", "Full"],
      ["partial", "Partial"],
      ["missed", "Missed"]
    ]) {
      const btn = el("button", {
        class: `challenge-btn challenge-btn--${value}`
          + (current === value ? " is-active" : ""),
        type: "button",
        text: label,
        onclick: () => setStatus(c, today, task, value)
      });
      statusesEl.appendChild(btn);
    }

    wrap.appendChild(row);
  }

  const { score, markedCount } = scoreDay(statuses, c.tasks);
  wrap.appendChild(
    el("div", { class: "challenge-today__score" },
      el("span", { text: "Today's score: " }),
      el("strong", { text: markedCount > 0 ? scorePercent(score) : "—" })
    )
  );

  return wrap;
}

function scorePercent(score) {
  return `${Math.round(score * 100)}%`;
}


/* --------------------------------------------------------------------------
   6. MUTATIONS
   -------------------------------------------------------------------------- */
async function setStatus(challenge, date, task, value) {
  // Find existing day doc or create a new one
  const existing = state.days.find(d => d.date === date);
  const statuses = { ...(existing?.statuses || {}), [task]: value };

  if (existing) {
    await updateDoc("challengeDays", existing.id, { statuses });
  } else {
    await addDoc("challengeDays", {
      challengeId: challenge.id,
      date,
      statuses
    });
  }

  await loadDays(challenge.id);
  render();
}


async function closeChallenge(c) {
  const days = state.days;
  const stats = overallAccuracy(c, days);

  if (!confirm(`Close "${c.name}" at ${stats.accuracy}% accuracy?`)) return;

  await updateDoc("challenges", c.id, {
    status: "closed",
    closedAt: new Date(),
    finalScore: stats.accuracy
  });

  await loadChallenges();
  state.activeChallenge = state.challenges.find(x => x.id === c.id);
  await loadDays(c.id);
  render();
}


async function reopenChallenge(c) {
  await updateDoc("challenges", c.id, {
    status: "active",
    closedAt: null,
    finalScore: null
  });
  await loadChallenges();
  state.activeChallenge = state.challenges.find(x => x.id === c.id);
  await loadDays(c.id);
  render();
}


async function deleteChallenge(c) {
  if (!confirm(`Delete "${c.name}"? All daily data will be lost.`)) return;

  // Delete all days, then the challenge
  for (const d of state.days.filter(x => x.challengeId === c.id)) {
    await deleteDoc("challengeDays", d.id);
  }
  await deleteDoc("challenges", c.id);

  state.activeChallenge = null;
  state.days = [];
  await loadChallenges();
  render();
}


/* --------------------------------------------------------------------------
   7. CREATE FORM
   -------------------------------------------------------------------------- */
let newTasks = [];


function bindForm() {
  refs.createBtn?.addEventListener("click", () => openModal());
  refs.modalClose?.addEventListener("click", closeModal);
  refs.modal?.addEventListener("click", (e) => {
    if (e.target === refs.modal) closeModal();
  });

  refs.taskAddBtn?.addEventListener("click", addTaskFromInput);
  refs.taskInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); addTaskFromInput(); }
  });

  refs.form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = (refs.name.value || "").trim();
    const duration = parseInt(refs.duration.value, 10) || 14;
    const start = refs.startDate.value || todayISO();

    if (!name) return alert("Name is required.");
    if (newTasks.length === 0) return alert("Add at least one task.");

    try {
      await addDoc("challenges", {
        name,
        startDate: start,
        durationDays: duration,
        tasks: newTasks,
        status: "active",
        closedAt: null,
        finalScore: null
      });

      resetForm();
      closeModal();
      await loadChallenges();
      render();
    } catch (err) {
      console.error("[Challenge] Create failed:", err);
      alert("Could not save.");
    }
  });
}


function openModal() {
  newTasks = [];
  refs.name.value = "";
  refs.duration.value = "14";
  refs.startDate.value = todayISO();
  renderTaskList();
  refs.modal.classList.remove("hidden");
}


function closeModal() {
  refs.modal.classList.add("hidden");
}


function addTaskFromInput() {
  const text = (refs.taskInput.value || "").trim();
  if (!text) return;
  if (newTasks.includes(text)) {
    alert("Task already added.");
    return;
  }
  newTasks.push(text);
  refs.taskInput.value = "";
  renderTaskList();
}


function renderTaskList() {
  if (!refs.tasksList) return;
  clear(refs.tasksList);
  for (let i = 0; i < newTasks.length; i++) {
    const t = newTasks[i];
    refs.tasksList.appendChild(
      el("div", { class: "challenge-form-task" },
        el("span", { text: t }),
        el("button", {
          class: "challenge-form-task__remove",
          type: "button",
          text: "×",
          onclick: () => {
            newTasks.splice(i, 1);
            renderTaskList();
          }
        })
      )
    );
  }
}


function resetForm() {
  refs.form.reset();
  newTasks = [];
}


/* --------------------------------------------------------------------------
   8. MODAL / ESC
   -------------------------------------------------------------------------- */
function bindModal() {
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !refs.modal?.classList.contains("hidden")) {
      closeModal();
    }
  });
}


/* --------------------------------------------------------------------------
   9. HELPERS
   -------------------------------------------------------------------------- */
function endDate(c) {
  const start = new Date(c.startDate);
  start.setDate(start.getDate() + c.durationDays - 1);
  return formatISO(start);
}
