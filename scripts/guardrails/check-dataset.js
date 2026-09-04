import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '../..');
const DATA_DIR = path.join(ROOT_DIR, 'datasets/context-management-bench/data');

export async function run() {
  if (!fs.existsSync(DATA_DIR)) {
      return { status: 'pass' }; // No dataset to check, or moved.
  }

  const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.jsonl'));

  for (const file of files) {
      const filePath = path.join(DATA_DIR, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n').filter(Boolean);

      const seenIds = new Set();

      let lineNum = 0;
      for (const line of lines) {
          lineNum++;
          try {
              const record = JSON.parse(line);

              if (!record.id) {
                  return { status: 'fail', message: `Dataset ${file} line ${lineNum} missing 'id'.` };
              }
              if (seenIds.has(record.id)) {
                  return { status: 'fail', message: `Dataset ${file} contains duplicate id: ${record.id}` };
              }
              seenIds.add(record.id);

              // Check required fields based on current repository schema
              if (!record.scenario) {
                  return { status: 'fail', message: `Dataset ${file} record ${record.id} missing 'scenario'.` };
              }
              if (!Array.isArray(record.messages)) {
                  return { status: 'fail', message: `Dataset ${file} record ${record.id} 'messages' is not an array.` };
              }
              if (!Array.isArray(record.evicted_message_ids) || !Array.isArray(record.retained_message_ids)) {
                  return { status: 'fail', message: `Dataset ${file} record ${record.id} missing evicted/retained arrays.` };
              }

              // Check if references correspond to actual messages
              const messageIds = new Set(record.messages.map(m => m.id));
              for (const id of record.evicted_message_ids) {
                  if (!messageIds.has(id)) {
                      return { status: 'fail', message: `Dataset ${file} record ${record.id} evicts unknown message id: ${id}` };
                  }
              }
              for (const id of record.retained_message_ids) {
                  if (!messageIds.has(id)) {
                      return { status: 'fail', message: `Dataset ${file} record ${record.id} retains unknown message id: ${id}` };
                  }
              }

          } catch (e) {
              return { status: 'fail', message: `Dataset ${file} line ${lineNum} is not valid JSON.` };
          }
      }
  }

  return { status: 'pass' };
}
