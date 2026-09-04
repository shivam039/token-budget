import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '../..');

export async function run() {
  const skillDir = path.join(ROOT_DIR, 'skills/token-budget-context-management');
  const skillFile = path.join(skillDir, 'SKILL.md');

  if (!fs.existsSync(skillFile)) {
     return { status: 'fail', message: 'SKILL.md not found' };
  }

  const content = fs.readFileSync(skillFile, 'utf8');

  // We want to ensure that the skill retains its "diagnosis-first" and restrictive triggering behavior.
  // We do this by ensuring the description hasn't been replaced with something overly broad.
  // Instead of calling an LLM in the guardrail runner, we enforce the structural integrity
  // of the trigger instructions found in the frontmatter and body.

  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) {
    return { status: 'fail', message: `SKILL.md is missing required frontmatter block.` };
  }

  const descriptionMatch = frontmatterMatch[1].match(/^description:\s*(.+)$/m);
  if (!descriptionMatch) {
    return { status: 'fail', message: `SKILL.md frontmatter is missing 'description' field.` };
  }

  const description = descriptionMatch[1].toLowerCase();

  // Regression check:
  // The skill should trigger on context window limits / eviction, NOT just tokens or RAG.
  // Ensure the description contains narrowing qualifiers and does not use overly broad triggers.

  const requiredDiagnosticTriggers = [
    'context window',
    'evict',
    'budget'
  ];

  const forbiddenBroadTriggers = [
    'any time llm is mentioned',
    'always use this',
    'rag quality',
    'should i use gpt'
  ];

  let missingNarrowing = [];
  for (const trigger of requiredDiagnosticTriggers) {
      if (!description.includes(trigger) && !content.toLowerCase().includes(trigger)) {
          missingNarrowing.push(trigger);
      }
  }

  let foundForbidden = [];
  for (const trigger of forbiddenBroadTriggers) {
      if (description.includes(trigger)) {
          foundForbidden.push(trigger);
      }
  }

  if (missingNarrowing.length > 0) {
      return {
          status: 'fail',
          message: `Skill description regression: Lost diagnostic narrowing keywords: ${missingNarrowing.join(', ')}.\nThe skill must only trigger for context size / history limits, not general LLM problems.`
      };
  }

  if (foundForbidden.length > 0) {
      return {
          status: 'fail',
          message: `Skill description regression: Found overly broad triggers: ${foundForbidden.join(', ')}.\nThe skill must not trigger for general RAG or model selection problems.`
      };
  }

  // Also perform a sanity check on the "Decision tree" section in the body which reinforces this behavior
  if (!content.includes('Does the app maintain growing LLM conversation history?')) {
      return {
          status: 'warn',
          message: `Skill body regression: The decision tree guiding the agent away from unnecessary use cases appears to be missing or modified.`
      };
  }

  return { status: 'pass' };
}
