const http = require('http');

async function inspect() {
  const targets = await (await fetch('http://127.0.0.1:9222/json/list')).json();
  const page = targets.find((t) => t.type === 'page') || targets[0];
  const ws = new WebSocket(page.webSocketDebuggerUrl);

  ws.onopen = async () => {
    const send = (m, p = {}) =>
      new Promise((res, rej) => {
        const id = Math.floor(Math.random() * 100000);
        const onMsg = (msg) => {
          const d = JSON.parse(msg.data);
          if (d.id === id) {
            ws.removeEventListener('message', onMsg);
            if (d.error) rej(d.error);
            else res(d.result);
          }
        };
        ws.addEventListener('message', onMsg);
        ws.send(JSON.stringify({ id, method: m, params: p }));
      });

    // Navigate to /admin/cohorts
    await send('Page.navigate', { url: 'http://localhost:5173/admin/cohorts' });
    await new Promise((r) => setTimeout(r, 2500));

    const evalRes = await send('Runtime.evaluate', {
      expression: `(() => ({
        url: window.location.href,
        title: document.title,
        bodyText: document.body.innerText.slice(0, 500),
        tableRows: Array.from(document.querySelectorAll('tbody tr')).map(r => r.innerText.replace(/\\s+/g, ' ')),
        buttons: Array.from(document.querySelectorAll('button')).map(b => b.innerText.trim()).filter(Boolean)
      }))()`,
      returnByValue: true,
    });

    console.log('Inspection result:', JSON.stringify(evalRes.result?.value, null, 2));
    ws.close();
  };
}

inspect().catch(console.error);
