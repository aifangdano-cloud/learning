/*
  1) Create a Supabase project.
  2) Run supabase-setup.sql in Supabase SQL Editor.
  3) Paste your project URL and anon key below.
*/
const SUPABASE_URL = "https://etkwtcauijkyhqwrnwrm.supabase.co/rest/v1/";
const SUPABASE_ANON_KEY = "sb_publishable_LWTfAB1_ld7eGVpKZ50cVg_onuPNg3w";

const configured = SUPABASE_URL.startsWith("https://") &&
  !SUPABASE_URL.includes("PASTE_") && !SUPABASE_ANON_KEY.includes("PASTE_");

const db = configured
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

const $ = (id) => document.getElementById(id);
const state = { quiz: null, studentName: "", submissionId: null, submitted: false };

function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 3200);
}
function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[c]));
}
function normaliseName(value) {
  return value.trim().replace(/\s+/g, " ");
}
function allQuestions() {
  return (state.quiz?.sections || []).flatMap(section =>
    (section.questions || []).map(question => ({ ...question, sectionTitle: section.title }))
  );
}
function updateAnsweredCount() {
  const count = document.querySelectorAll('input[type="radio"]:checked').length;
  $("answered-count").textContent = count;
}
async function loadQuiz() {
  if (!db) {
    $("setup-panel").classList.remove("hidden");
    $("leaderboard").innerHTML = '<p class="empty-state">Connect your Supabase project to load the quiz and leaderboard.</p>';
    showToast("Add your Supabase URL and anon key in app.js first.");
    return;
  }
  const { data, error } = await db.rpc("get_quiz");
  if (error) {
    console.error(error);
    showToast("Could not load quiz. Check that the SQL setup has been completed.");
    return;
  }
  state.quiz = data;
  if (!allQuestions().length) {
    $("leaderboard").innerHTML = '<p class="empty-state">No questions have been added yet. Add your quiz sections and questions in Supabase.</p>';
  }
}
function renderQuiz() {
  const sections = state.quiz.sections || [];
  let questionNumber = 0;
  $("quiz-content").innerHTML = sections.map(section => {
    const questions = section.questions || [];
    if (!questions.length) return "";
    return `<section class="quiz-section">
      <h3>${escapeHTML(section.title)}</h3>
      ${questions.map(question => {
        questionNumber++;
        const options = question.options || [];
        return `<article class="question-card">
          <p class="question-title"><span class="question-number">${questionNumber}.</span>${escapeHTML(question.question)}</p>
          <div class="option-list">
            ${options.map((option, index) => {
              const value = typeof option === "string" ? option : option.value;
              const label = typeof option === "string" ? option : option.label;
              const id = `q-${escapeHTML(question.id)}-${index}`;
              return `<label class="option" for="${id}">
                <input id="${id}" type="radio" name="question-${escapeHTML(question.id)}"
                       value="${escapeHTML(value)}">
                <span>${escapeHTML(label)}</span>
              </label>`;
            }).join("")}
          </div>
        </article>`;
      }).join("")}
    </section>`;
  }).join("");
  $("quiz-content").querySelectorAll('input[type="radio"]').forEach(input =>
    input.addEventListener("change", updateAnsweredCount)
  );
  updateAnsweredCount();
}
$("start-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!db || !state.quiz) {
    showToast("The quiz is not connected yet. Check the Supabase setup.");
    return;
  }
  const name = normaliseName($("student-name").value);
  if (!name) return;
  if (!allQuestions().length) {
    showToast("The quiz does not have any questions yet.");
    return;
  }
  state.studentName = name;
  state.submissionId = crypto.randomUUID();
  state.submitted = false;
  $("welcome-title").textContent = `Good luck, ${name}!`;
  $("setup-panel").classList.add("hidden");
  $("result-panel").classList.add("hidden");
  $("quiz-panel").classList.remove("hidden");
  renderQuiz();
  window.scrollTo({ top: $("quiz-panel").offsetTop - 20, behavior: "smooth" });
});
$("submit-quiz").addEventListener("click", async () => {
  if (state.submitted) return;
  const questions = allQuestions();
  const answers = questions.map(question => {
    const selected = document.querySelector(`input[name="question-${CSS.escape(question.id)}"]:checked`);
    return { question_id: question.id, answer: selected ? selected.value : "" };
  });
  const unanswered = answers.filter(answer => !answer.answer).length;
  if (unanswered) {
    $("quiz-status").textContent = `You still have ${unanswered} unanswered question(s).`;
    showToast(`Please answer all ${unanswered} remaining question(s).`);
    return;
  }
  const button = $("submit-quiz");
  button.disabled = true;
  button.textContent = "Submitting…";
  const { data, error } = await db.rpc("submit_quiz", {
    p_student_name: state.studentName,
    p_answers: answers,
    p_submission_id: state.submissionId
  });
  button.disabled = false;
  button.innerHTML = 'Submit all answers <span>→</span>';
  if (error) {
    console.error(error);
    showToast(error.message || "Could not submit your quiz. Please try again.");
    return;
  }
  state.submitted = true;
  $("quiz-panel").classList.add("hidden");
  $("result-panel").classList.remove("hidden");
  $("result-score").textContent = `${data.score} / ${data.max_score}`;
  $("result-total").textContent = data.total_score;
  $("result-message").textContent = `Well done, ${state.studentName}! Your score has been added to your cumulative leaderboard total.`;
  await loadLeaderboard();
  window.scrollTo({ top: $("result-panel").offsetTop - 20, behavior: "smooth" });
});
async function loadLeaderboard() {
  if (!db) return;
  $("leaderboard").innerHTML = '<p class="loading-text">Loading leaderboard…</p>';
  const { data, error } = await db.rpc("get_leaderboard");
  if (error) {
    console.error(error);
    $("leaderboard").innerHTML = '<p class="empty-state">Could not load leaderboard. Check your database setup.</p>';
    return;
  }
  renderLeaderboard(data || []);
}
function renderLeaderboard(rows) {
  const container = $("leaderboard");
  if (!rows.length) {
    container.innerHTML = '<p class="empty-state">No scores yet. Be the first to complete the quiz!</p>';
    return;
  }
  const podiumOrder = [
    ...(rows[1] ? [{ row: rows[1], rank: 2 }] : []),
    ...(rows[0] ? [{ row: rows[0], rank: 1 }] : []),
    ...(rows[2] ? [{ row: rows[2], rank: 3 }] : [])
  ];
  const podiumHTML = podiumOrder.map(({ row, rank }) => {
    const first = rank === 1;
    return `<div class="podium-place ${first ? "first" : ""}">
      ${first ? '<div class="trophy">🏆</div>' : ""}
      <div class="podium-rank">${rank === 1 ? "1st" : rank === 2 ? "2nd" : "3rd"}</div>
      <div class="podium-avatar" aria-hidden="true">👤</div>
      <div class="podium-name">${escapeHTML(row.student_name)}</div>
      <div class="podium-score">${Number(row.total_score).toLocaleString()} pts</div>
    </div>`;
  }).join("");
  const rest = rows.slice(3).map(row => `
    <div class="ranking-row">
      <span class="rank-number">${row.rank}th</span>
      <span class="mini-avatar" aria-hidden="true">👤</span>
      <span class="rank-name" title="${escapeHTML(row.student_name)}">${escapeHTML(row.student_name)}</span>
      <span class="rank-score">${Number(row.total_score).toLocaleString()}</span>
    </div>`).join("");
  container.innerHTML = `<div class="podium">${podiumHTML}</div>
    ${rest ? `<div class="ranking-list">${rest}</div>` : ""}
    <p class="empty-state" style="padding-bottom:0">${rows.length} participant(s) on the leaderboard</p>`;
}
$("refresh-leaderboard").addEventListener("click", loadLeaderboard);
$("try-again").addEventListener("click", () => {
  $("result-panel").classList.add("hidden");
  $("setup-panel").classList.remove("hidden");
  $("student-name").value = state.studentName;
  window.scrollTo({ top: $("setup-panel").offsetTop - 20, behavior: "smooth" });
});
(async function init() {
  await loadQuiz();
  await loadLeaderboard();
})();
