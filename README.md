# Quiz Challenge + Cumulative Leaderboard

A static HTML/CSS/JavaScript quiz front end with Supabase storing questions, answer keys, attempts and cumulative student scores. Designed for deployment on GitHub Pages.

## What it does

- Asks each student for a name before the quiz.
- Displays every section and question in one quiz session.
- Requires every question to be answered before submission.
- Marks answers on the server, not in browser JavaScript.
- Adds the score from the whole quiz to the student's cumulative total.
- Merges names case-insensitively and ignores extra spaces (`"Aina"` and `" aina "` become one entry).
- Shows a ranked leaderboard with a top-three podium.
- Stores scores in Supabase, so they are shared across devices and persist after refresh.
- Uses a submission ID so a network retry of the same submission is not counted twice.

## Part A — Create the database

1. Go to https://supabase.com and create a free project.
2. Open **SQL Editor** in your Supabase project.
3. Open `supabase-setup.sql`, copy the entire contents, and run it.
4. The SQL creates three demo sections and three sample questions. Replace these with your actual quiz content before sharing the website.

### Add your real questions

In Supabase, open **Table Editor**.

**quiz_sections** columns:
- `id`: short unique ID, e.g. `part-1`
- `title`: section heading, e.g. `Part 1 – Obstetrics`
- `sort_order`: 1, 2, 3, etc.

**quiz_questions** columns:
- `id`: unique ID, e.g. `ob-001`
- `section_id`: an existing section ID
- `question`: the full question text
- `options`: JSON array of answer strings, e.g. `["Option A","Option B","Option C","Option D"]`
- `correct_answer`: the exact text of the correct option (must match one option)
- `points`: marks for that question, e.g. `1` or `5`
- `sort_order`: order within its section

Add every question from every part. The quiz page automatically loads all sections and questions in sort order. Do not put the answer key in `app.js`.

To remove the demo questions, delete the sample rows in `quiz_questions` (IDs `p1-q1`, `p2-q1`, `p3-q1`) and replace them with your own. You can edit the demo rows instead of deleting them.

## Part B — Connect the website

1. In Supabase, go to **Project Settings → API** (or **Data API / API Keys**, depending on the dashboard layout).
2. Copy the **Project URL**.
3. Copy the **anon / publishable key**. Do not use the `service_role` or secret key in browser code.
4. Open `app.js`.
5. Replace:
   - `PASTE_YOUR_SUPABASE_PROJECT_URL_HERE`
   - `PASTE_YOUR_SUPABASE_ANON_KEY_HERE`
6. Save the file.

The anon key is intended for public browser use. The SQL permissions and server-side functions are designed so the browser cannot directly read the answer key or edit leaderboard totals.

## Part C — Publish on GitHub Pages

1. Create or open your GitHub repository.
2. Upload `index.html`, `styles.css`, and `app.js` to the repository root.
3. Keep `supabase-setup.sql` and `README.md` in the repository if you want, but they are not required by the live website.
4. In GitHub, open **Settings → Pages**.
5. Under Build and deployment, select **Deploy from a branch**.
6. Select your main branch and `/ (root)`, then Save.
7. Wait for GitHub Pages to publish, then open the Pages URL.

## How cumulative scoring works

- A student completes all questions in all sections in one sitting.
- Supabase calculates the score by comparing each submitted answer with the stored answer key.
- The score is added to the participant with that name.
- If the same name completes another quiz attempt later, that new score is added to the same cumulative total.
- Names are matched without case sensitivity and with repeated spaces normalised. For example, `Aina`, `aina`, and ` Aina ` merge into one participant.
- Different spellings are treated as different names. Ask students to use the same spelling each time.

**Important:** This version adds each completed full-quiz attempt to the student's total. It does not replace an earlier attempt or keep only the best score.

## Customisation

- Change colours, fonts, spacing and leaderboard styling in `styles.css`.
- Change page wording and structure in `index.html`.
- Add or edit questions and sections in Supabase Table Editor.
- The podium shows up to three students. Remaining students appear in the ranked list.

## Notes and limitations

- No student login is required. Anyone who knows the public quiz URL can submit a name and attempt the quiz.
- Name-only identity is not secure identity verification. A student could submit using another student's name. If that matters, add individual sign-in or a class access code.
- The public leaderboard exposes student display names and scores. Get permission before publishing identifiable student information; consider using nicknames.
- Because this is cumulative, a student can increase their total by taking the quiz multiple times. If you want only one attempt per student, or want the highest score rather than the sum of attempts, the database logic needs to be changed.
- The quiz requires every active question in the database to be answered. If you want separate independent quiz events, use an event/quiz ID in the database design rather than mixing unrelated question banks.
- Keep the Supabase project URL and anon/publishable key in the front end only. Never expose the service-role or secret key.
