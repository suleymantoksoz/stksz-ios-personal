const fs = require('fs');
const p = 'www/style.css';
let c = fs.readFileSync(p, 'utf8');

const BLOCK = `

/* =====================================================================
   FAZ 2 · AUTH / DESIGN SYSTEM / UI CONSOLIDATION
   Aşağıdaki kurallar en sonda olduğu için cascade'i kazanır.
   ===================================================================== */

/* ---- 1. COMPACT SINGLE-BRAND AUTH (320–430 px) ---- */
.auth-card{max-width:400px;box-sizing:border-box}
.auth-hero{margin:0 0 10px;text-align:center}
.auth-hero img{width:clamp(56px,20vw,104px);height:auto;display:block;margin:0 auto 8px;border-radius:16px}
.auth-hero-logo img{width:100%;height:100%;object-fit:contain}
#authChoices{display:grid;gap:8px}
.auth-step-view{max-height:calc(var(--stksz-vh,100dvh) - 180px);overflow-y:auto;-webkit-overflow-scrolling:touch;padding-right:4px}
.auth-step-back{min-width:34px;min-height:34px;display:inline-flex;align-items:center;justify-content:center;border-radius:8px;background:var(--panel);border:1px solid var(--line);color:var(--text);font-size:14px;cursor:pointer}
.auth-step-head{margin:6px 0 10px;font-size:12px;letter-spacing:.4px;color:var(--muted)}
@media(max-width:430px){.auth-card{max-width:100%;margin:0 12px}}

/* ---- 2. TYPOGRAPHY: fluid clamp + KPI no-wrap ---- */
:root{--fs-base:clamp(13px,2.8vw,15px);--fs-sm:clamp(10px,2.3vw,12px);--fs-xs:clamp(8.5px,2vw,10.5px)}
body{font-size:var(--fs-base);line-height:1.45}
.kpi-num,.portfolio-value-hero b,.hero-score b,.metric-value,.price-big{white-space:nowrap}
.nav button{font-size:10px;letter-spacing:.3px;white-space:nowrap}

/* ---- 3. EMPTY STATE COMPONENT ---- */
.empty-state{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:28px 16px;text-align:center;color:var(--muted)}
.empty-state b{font-size:14px;letter-spacing:.4px;margin-bottom:6px;color:var(--text)}
.empty-state small{font-size:11px;line-height:1.4;max-width:260px}

/* ---- 4. LIGHT THEME PARITY ---- */
body[data-theme="light"]{--positive:#009e57;--copper:#B87333;--gold:#a08040}
body[data-theme="light"] .empty-state{color:#66746d}
body[data-theme="light"] .empty-state b{color:#16201b}
body[data-theme="light"] .auth-step-back{background:#fff;border-color:#ccd7d1;color:#16201b}
body[data-theme="light"] .auth-step-head{color:#66746d}

/* ---- 5. EDITOR COPPER CHROME ---- */
#stkszEditorCode:focus-visible{outline:2px solid rgba(184,115,51,.45);border-color:#b87333}
.lint-ok{color:var(--gold,#CFAE5F)!important}

/* ---- 6. SEARCH/MODAL STANDARD ---- */
#searchModal .modal-box{border-radius:20px}
.modal-head{position:sticky;top:0;z-index:2;background:var(--panel);padding-bottom:6px;border-radius:20px 20px 0 0}

/* ---- 7. BOTTOM NAV INDICATOR ---- */
.nav button.active{color:var(--copper)!important}
.nav button.active::after{content:"";position:absolute;left:50%;bottom:-2px;transform:translateX(-50%);width:14px;height:2px;border-radius:2px;background:var(--copper)}

/* ---- 8. MISC MOBILE ---- */
.news-dropdown-field select{appearance:auto;-webkit-appearance:auto;background:var(--panel);color:var(--text);border:1px solid var(--line);border-radius:8px;padding:6px 8px;font-size:var(--fs-sm)}
.toast{max-width:min(92vw,380px);left:50%;transform:translateX(-50%);bottom:90px;top:auto;border-radius:14px}
.auth-card,.modal-box{box-shadow:0 12px 40px rgba(0,0,0,.35)}
`;

if (!c.includes('FAZ 2 · AUTH / DESIGN SYSTEM')) {
  c += BLOCK;
  fs.writeFileSync(p, c);
  console.log('FAZ 2 CSS block appended, total lines:', c.split(/\r?\n/).length);
} else {
  console.log('already present');
}
