import { resolveEndpoint, type Endpoint } from '../../shared/catalog';
export function snippets(endpoint: Endpoint, values: Record<string, string>, body: any, base: string, mode?: string) {
  let path: string;
  try { path = resolveEndpoint(endpoint, values); } catch { path = `/api/v1${endpoint.path}`; }
  const host = base ? base.replace(/\/api\/v1$/, '') : 'https://YOUR_API_HOST';
  const url = host + path;
  const key = endpoint.owner ? 'NENO_OWNER_TOKEN' : 'NENO_API_KEY';
  const multipart = endpoint.input === 'multipart' || (endpoint.input === 'comment' && mode === 'multipart');
  const raw = endpoint.input === 'raw';
  const shell = (value: string) => `'${value.replace(/'/g, `'"'"'`)}'`;
  const hasBody = body !== undefined && endpoint.method !== 'GET';
  const stream = endpoint.output === 'stream' || body?.stream;
  let curl = `curl --fail-with-body${stream ? ' -N' : ''} -X ${endpoint.method} ${shell(url)} \\\n  -H "Authorization: Bearer $${key}"`;
  if (multipart) {
    curl += ` \\\n  -F '${endpoint.input === 'comment' ? 'files' : 'file'}=@./example.txt'`;
    for (const [k, v] of Object.entries(body || {})) curl += ` \\\n  -F ${shell(`${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)}`;
  } else if (raw) curl += ` \\\n  -H 'Content-Type: application/octet-stream' \\\n  --data-binary @./example.txt`;
  else if (hasBody) curl += ` \\\n  -H 'Content-Type: application/json' \\\n  --data-raw ${shell(JSON.stringify(body))}`;
  if (endpoint.output === 'download') curl += ` \\\n  --output ./download.bin`;
  let js = `// 在 Node.js 服务端运行，Key 从环境变量读取\n`;
  if (multipart || raw) js += `import { readFile } from 'node:fs/promises';\n`;
  if (multipart) {
    js += `const form = new FormData();\nform.append('${endpoint.input === 'comment' ? 'files' : 'file'}', new Blob([await readFile('./example.txt')]), 'example.txt');\n`;
    for (const [k, v] of Object.entries(body || {})) js += `form.append(${JSON.stringify(k)}, ${JSON.stringify(typeof v === 'string' ? v : JSON.stringify(v))});\n`;
  }
  js += `const response = await fetch(${JSON.stringify(url)}, {\n  method: '${endpoint.method}',\n  headers: {\n    Authorization: 'Bearer ' + process.env.${key}${hasBody && !multipart ? `,\n    'Content-Type': '${raw ? 'application/octet-stream' : 'application/json'}'` : ''}\n  }${hasBody || multipart || raw ? `,\n  body: ${multipart ? 'form' : raw ? "await readFile('./example.txt')" : `JSON.stringify(${JSON.stringify(body, null, 2)})`}` : ''}\n});\nif (!response.ok) throw new Error(await response.text());\n`;
  js += stream ? `// SSE 按空行分帧；保存事件 id 用于 since 续传。\nconst decoder = new TextDecoder();\nfor await (const chunk of response.body) {\n  process.stdout.write(decoder.decode(chunk, { stream: true }));\n}` : endpoint.output === 'download' ? `const { writeFile } = await import('node:fs/promises');\nawait writeFile('./download.bin', new Uint8Array(await response.arrayBuffer()));` : `console.log(await response.text());`;
  let python = `import os\nimport requests\n\nheaders = {"Authorization": "Bearer " + os.environ["${key}"]}\n`;
  if (multipart || raw) python += `from pathlib import Path\nfile_bytes = Path("example.txt").read_bytes()\n`;
  python += `response = requests.request(\n    ${JSON.stringify(endpoint.method)}, ${JSON.stringify(url)},\n    headers=headers,\n`;
  if (multipart) python += `    files={"${endpoint.input === 'comment' ? 'files' : 'file'}": ("example.txt", file_bytes)},\n    data=${JSON.stringify(Object.fromEntries(Object.entries(body || {}).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)])))},\n`;
  else if (raw) python += `    data=file_bytes,\n`;
  else if (hasBody) python += `    json=__import__("json").loads(${JSON.stringify(JSON.stringify(body))}),\n`;
  python += `    stream=${stream || endpoint.output === 'download' ? 'True' : 'False'}, timeout=(10, 90),\n)\nresponse.raise_for_status()\n`;
  python += stream ? `for line in response.iter_lines(decode_unicode=True):\n    if line:\n        print(line)` : endpoint.output === 'download' ? `with open("download.bin", "wb") as output:\n    for chunk in response.iter_content(65536):\n        output.write(chunk)` : 'print(response.text)';
  return { curl, JavaScript: js, Python: python };
}
