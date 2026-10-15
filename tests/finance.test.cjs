const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');const path=require('node:path');
function setup(){
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');const start=html.indexOf('function renderFinance(){');const end=html.indexOf('// ALUMNOS',start);
 const elements={};for(const id of ['financeMonth','fIncome','fTransfer','fCash','fTeacher','settlementBody'])elements['#'+id]={value:'2026-10',textContent:'',innerHTML:''};
 const ctx={window:{},$:id=>elements[id],monthKey:s=>s.slice(0,7),localISO:()=> '2026-10-14',money:n=>Math.round(n*100),payments:[{profesor_id:'teacher',fecha_cobro:'2026-10-01',importe:100,medio_pago:'Efectivo'}],teachers:[{id:'teacher',nombre:'Profesor'}],settlement:()=>({inc:100,pct:50,total:50})};
 vm.runInNewContext(html.slice(start,end),ctx);return {ctx,elements};
}
test('Ingresos suma Corporativos una vez incluso tras refrescos repetidos',()=>{const {ctx,elements}=setup();ctx.window.PointCorporativosFinance={month:'2026-10',status:'ready',total:2505};for(let i=0;i<5;i++)ctx.renderFinance();assert.match(elements['#fIncome'].textContent,/125,05/);assert.equal(elements['#fTeacher'].textContent,5000);assert.equal(elements['#fCash'].textContent,10000);});
test('mes sin cobros corporativos conserva ingreso de clases',()=>{const {ctx,elements}=setup();ctx.window.PointCorporativosFinance={month:'2026-10',status:'ready',total:0};ctx.renderFinance();assert.match(elements['#fIncome'].textContent,/100,00/);});
test('cambio de mes y error de consulta no presentan un total incompleto',()=>{const {ctx,elements}=setup();ctx.window.PointCorporativosFinance={month:'2026-09',status:'ready',total:99999};ctx.renderFinance();assert.equal(elements['#fIncome'].textContent,'Pendiente de consulta');ctx.window.PointCorporativosFinance={month:'2026-10',status:'error'};ctx.renderFinance();assert.equal(elements['#fIncome'].textContent,'Total no disponible');});
