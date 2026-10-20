// Erzeugt t3/icon.png (Testbild), damit die Tests ohne den Electron-Ordner laufen
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  const url = await p.evaluate(() => { const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 256, 256); gr.addColorStop(0, '#4a78d0'); gr.addColorStop(1, '#2c4f9e'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    g.fillStyle = '#fff'; g.font = 'bold 120px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('N', 128, 136); return c.toDataURL('image/png'); });
  fs.writeFileSync(path.join(__dirname, 'icon.png'), Buffer.from(url.split(',')[1], 'base64')); await b.close();
})();
