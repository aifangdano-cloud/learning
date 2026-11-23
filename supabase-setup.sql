-- QUIZ + CUMULATIVE LEADERBOARD
-- Run this entire file in Supabase Dashboard > SQL Editor.
-- Then add/edit your sections and questions in the seed section at the bottom.

create extension if not exists pgcrypto;

create table if not exists public.quiz_sections (
  id text primary key,
  title text not null,
  sort_order integer not null default 0
);

create table if not exists public.quiz_questions (
  id text primary key,
  section_id text not null references public.quiz_sections(id) on delete cascade,
  question text not null,
  options jsonb not null,
  correct_answer text not null,
  points integer not null default 1 check (points > 0),
  sort_order integer not null default 0
);

create table if not exists public.quiz_participants (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  normalized_name text not null unique,
  total_score integer not null default 0,
  total_questions integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique,
  participant_id uuid not null references public.quiz_participants(id) on delete cascade,
  score integer not null,
  max_score integer not null,
  question_count integer not null,
  created_at timestamptz not null default now()
);

create index if not exists quiz_questions_section_sort_idx
  on public.quiz_questions(section_id, sort_order);
create index if not exists quiz_participants_score_idx
  on public.quiz_participants(total_score desc);

-- Do not allow the browser to read answer keys or write scores directly.
alter table public.quiz_sections enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.quiz_participants enable row level security;
alter table public.quiz_attempts enable row level security;

revoke all on public.quiz_sections from anon, authenticated;
revoke all on public.quiz_questions from anon, authenticated;
revoke all on public.quiz_participants from anon, authenticated;
revoke all on public.quiz_attempts from anon, authenticated;

-- Return question text and choices only. The answer key stays in the database.
create or replace function public.get_quiz()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'sections',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', s.id,
          'title', s.title,
          'sort_order', s.sort_order,
          'questions', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', q.id,
                'question', q.question,
                'options', q.options,
                'points', q.points,
                'sort_order', q.sort_order
              ) order by q.sort_order, q.id
            )
            from public.quiz_questions q
            where q.section_id = s.id
          ), '[]'::jsonb)
        ) order by s.sort_order, s.id
      )
      from public.quiz_sections s
    ), '[]'::jsonb)
  );
$$;

-- Submit one complete quiz attempt. Every question in the database must be answered.
-- A repeated name (case-insensitive, extra spaces ignored) updates the same participant.
-- Each new completed attempt adds its points to that participant's cumulative total.
create or replace function public.submit_quiz(
  p_student_name text,
  p_answers jsonb,
  p_submission_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_normalized text;
  v_question_count integer;
  v_answer_count integer;
  v_unique_answer_count integer;
  v_score integer;
  v_max_score integer;
  v_participant_id uuid;
  v_total_score integer;
  v_existing public.quiz_attempts%rowtype;
begin
  v_name := regexp_replace(trim(coalesce(p_student_name, '')), '\s+', ' ', 'g');
  if length(v_name) < 1 or length(v_name) > 40 then
    raise exception 'Please enter a name between 1 and 40 characters.';
  end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'array' then
    raise exception 'Answers must be submitted as a list.';
  end if;
  if p_submission_id is null then
    raise exception 'Submission ID is missing.';
  end if;

  -- Idempotency: a network retry of the same submission cannot add the score twice.
  select * into v_existing
  from public.quiz_attempts
  where submission_id = p_submission_id;

  if found then
    select total_score into v_total_score
    from public.quiz_participants
    where id = v_existing.participant_id;
    return jsonb_build_object(
      'score', v_existing.score,
      'max_score', v_existing.max_score,
      'total_score', v_total_score,
      'already_submitted', true
    );
  end if;

  select count(*) into v_question_count from public.quiz_questions;
  select count(*) into v_answer_count from jsonb_array_elements(p_answers);
  select count(distinct item->>'question_id') into v_unique_answer_count
  from jsonb_array_elements(p_answers) as x(item);

  if v_question_count = 0 then
    raise exception 'No quiz questions have been configured.';
  end if;
  if v_answer_count <> v_question_count or v_unique_answer_count <> v_question_count then
    raise exception 'Please answer every question exactly once.';
  end if;

  -- Reject unknown question IDs so clients cannot submit a partial or substituted quiz.
  if exists (
    select 1
    from jsonb_array_elements(p_answers) as x(item)
    left join public.quiz_questions q on q.id = x.item->>'question_id'
    where q.id is null
  ) then
    raise exception 'The submission contains an unknown question.';
  end if;

  select
    coalesce(sum(case when x.item->>'answer' = q.correct_answer then q.points else 0 end), 0)::integer,
    coalesce(sum(q.points), 0)::integer
  into v_score, v_max_score
  from jsonb_array_elements(p_answers) as x(item)
  join public.quiz_questions q on q.id = x.item->>'question_id';

  v_normalized := lower(v_name);

  insert into public.quiz_participants(display_name, normalized_name, total_score, total_questions, updated_at)
  values (v_name, v_normalized, v_score, v_question_count, now())
  on conflict (normalized_name) do update
    set total_score = public.quiz_participants.total_score + excluded.total_score,
        total_questions = public.quiz_participants.total_questions + excluded.total_questions,
        updated_at = now()
  returning id, total_score into v_participant_id, v_total_score;

  insert into public.quiz_attempts(submission_id, participant_id, score, max_score, question_count)
  values (p_submission_id, v_participant_id, v_score, v_max_score, v_question_count);

  return jsonb_build_object(
    'score', v_score,
    'max_score', v_max_score,
    'total_score', v_total_score,
    'already_submitted', false
  );
end;
$$;

create or replace function public.get_leaderboard()
returns table (
  rank bigint,
  student_name text,
  total_score integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    row_number() over (order by p.total_score desc, p.updated_at asc, p.display_name asc) as rank,
    p.display_name as student_name,
    p.total_score
  from public.quiz_participants p
  order by p.total_score desc, p.updated_at asc, p.display_name asc;
$$;

grant execute on function public.get_quiz() to anon, authenticated;
grant execute on function public.get_leaderboard() to anon, authenticated;
grant execute on function public.submit_quiz(text, jsonb, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- DEMO CONTENT: replace these example questions with your own quiz content.
-- Option values must match the correct_answer exactly.
-- Add every section and every question here (or through the Supabase Table Editor).
-- ---------------------------------------------------------------------------

insert into public.quiz_sections(id, title, sort_order) values
  ('part-1', 'Part 1', 1),
  ('part-2', 'Part 2', 2),
  ('part-3', 'Part 3', 3)
on conflict (id) do nothing;

insert into public.quiz_questions(id, section_id, question, options, correct_answer, points, sort_order) values
  ('p1-q1', 'part-1', 'What does HTML stand for?', '["HyperText Markup Language","HighText Machine Language","HyperTool Multi Language","HomeText Markup Link"]'::jsonb, 'HyperText Markup Language', 1, 1),
  ('p2-q1', 'part-2', 'Which language is primarily used to style web pages?', '["HTML","CSS","SQL","Python"]'::jsonb, 'CSS', 1, 1),
  ('p3-q1', 'part-3', 'Which JavaScript keyword declares a block-scoped variable that can be reassigned?', '["const","let","static","define"]'::jsonb, 'let', 1, 1)
on conflict (id) do nothing;
