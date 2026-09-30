// User-configured observational hook. It cannot approve or modify tool arguments.
let input = '';
for await (const chunk of process.stdin) {
  input += chunk;
  if (input.length > 16_384) throw new Error('Hook input too large.');
}
const context = JSON.parse(input);
process.stdout.write(
  JSON.stringify({ decision: 'continue', message: `${context.event}: ${context.tool.name}` }),
);
