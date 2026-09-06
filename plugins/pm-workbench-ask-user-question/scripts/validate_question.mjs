export function validateQuestion(question) {
  if (!question?.id || !question.question || !Array.isArray(question.options)) throw new Error('问题缺少 id、question 或 options');
  if (question.options.length < 2 || question.options.length > 3) throw new Error('选项必须为 2-3 个');
  if (question.options.some(option => !option.id || !option.label)) throw new Error('每个选项必须包含 id 和 label');
  return question;
}
