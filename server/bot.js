// Rule-based assistant. It returns message KEYS; the client renders them in the user's language.
// Swap answer() for an LLM call later, but keep the rules: answer only from APPROVED knowledge,
// never invent, hand off to staff when unsure (PRD 7.3).
const R = {
  book: /book|interview|ամրագր|հարցազր|запис|собесед/,
  student: /schedule|payment|attendance|library|excuse|դասացուց|վճար|հաճախ|գրադարան|բացակայ|расписан|оплат|посещ|библиот|уважит|пропуст/,
  sched: /schedule|դասացուց|расписан/, pay: /payment|վճար|оплат/, excuse: /excuse|բացակայ|уважит|пропуст/,
  courses: /course|program|դասընթաց|ծրագ|курс|програм/, adm: /admission|entry|ընդունել|поступ|вступит/,
};
export const detectLang = (t, cur = 'en') =>
  /[\u0531-\u058F]/.test(t) ? 'hy' : /[\u0400-\u04FF]/.test(t) ? 'ru' : cur;

export function answer(text, user, kb) {
  const x = text.toLowerCase();
  const approved = (topic) => kb.some((s) => s.status === 'Approved' && s.topic === topic);
  if (R.book.test(x)) return { kind: 'slots', key: 'book' };
  if (R.student.test(x)) {
    if (user?.role !== 'student') return { kind: 'text', key: 'studentOnly' }; // authorization lives on the server
    return { kind: 'text', key: R.sched.test(x) ? 'sched' : R.pay.test(x) ? 'pay' : R.excuse.test(x) ? 'excuse' : 'attend' };
  }
  if (R.courses.test(x) && approved('courses')) return { kind: 'text', key: 'courses' };
  if (R.adm.test(x) && approved('admission')) return { kind: 'text', key: 'adm' };
  return { kind: 'fallback', key: 'fb' };
}
