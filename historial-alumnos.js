// Historial de alumnos: consulta de solo lectura sobre clases y pagos existentes.
(function(){
  const area=document.getElementById('historial');
  if(!area)return;
  const search=document.getElementById('historialBuscar');
  const select=document.getElementById('historialAlumno');
  const from=document.getElementById('historialDesde');
  const to=document.getElementById('historialHasta');
  const summary=document.getElementById('historialResumen');
  const classBody=document.getElementById('historialClases');
  const payBody=document.getElementById('historialPagos');
  const info=document.getElementById('historialInfo');
  const fold=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  function td(row,value){const cell=document.createElement('td');cell.textContent=String(value??'—');row.appendChild(cell);}
  function empty(body,message,colspan){body.replaceChildren();const row=body.insertRow();const cell=row.insertCell();cell.colSpan=colspan;cell.textContent=message;}
  function datesMatch(date){const d=String(date||'').slice(0,10);return (!from.value||d>=from.value)&&(!to.value||d<=to.value);}
  function fill(){
    const chosen=select.value,term=fold(search.value);
    const found=students.filter(s=>fold(s.nombre).includes(term));
    select.replaceChildren();
    const opt=document.createElement('option');opt.value='';opt.textContent=term?'Seleccionar alumno':'Elegí un alumno';select.appendChild(opt);
    found.forEach(s=>{const o=document.createElement('option');o.value=s.id;o.textContent=s.nombre;select.appendChild(o);});
    if(found.some(s=>String(s.id)===chosen))select.value=chosen;
    render();
  }
  function render(){
    const id=select.value;
    if(!id){summary.textContent='Seleccioná un alumno para ver su historial.';info.textContent='';empty(classBody,'Sin alumno seleccionado.',5);empty(payBody,'Sin alumno seleccionado.',6);return;}
    const cs=classes.filter(c=>String(c.alumno_id)===id&&datesMatch(c.fecha)).sort((a,b)=>String(b.fecha||'').localeCompare(String(a.fecha||'')));
    const ps=payments.filter(p=>String(p.alumno_id)===id&&datesMatch(p.fecha_cobro)).sort((a,b)=>String(b.fecha_cobro||'').localeCompare(String(a.fecha_cobro||'')));
    const paid=ps.reduce((s,p)=>s+Number(p.importe||0),0);
    const present=cs.filter(c=>fold(c.estado)==='presente').length;
    const pending=cs.filter(c=>!paymentForClass(c)&&!['ausente','suspendida','cancelada'].includes(fold(c.estado))).length;
    const expected=cs.filter(c=>!paymentForClass(c)&&!['ausente','suspendida','cancelada'].includes(fold(c.estado))).reduce((s,c)=>s+Number(c.importe_esperado||0),0);
    summary.textContent=cs.length+' clases registradas · '+present+' presentes · '+ps.length+' pagos · '+money(paid)+' cobrados · '+pending+' clases sin pago asociado';
    info.textContent='Los importes pendientes son orientativos: '+money(expected)+'. Los abonos mensuales pueden cubrir varias clases; no se duplican los ingresos.';
    classBody.replaceChildren();
    cs.forEach(c=>{const r=classBody.insertRow();td(r,c.fecha);td(r,(c.hora||'').slice(0,5));td(r,tName(c.profesor_id));td(r,c.estado||'Pendiente');td(r,paymentForClass(c)?'Pago asociado':'Sin pago asociado');});
    if(!cs.length)empty(classBody,'No hay clases registradas en ese período.',5);
    payBody.replaceChildren();
    ps.forEach(p=>{const r=payBody.insertRow();td(r,p.fecha_cobro);td(r,p.tipo_pago);td(r,p.mes_abonado?monthKey(p.mes_abonado):'—');td(r,tName(p.profesor_id));td(r,p.medio_pago||'—');td(r,money(p.importe));});
    if(!ps.length)empty(payBody,'No hay pagos registrados en ese período.',6);
  }
  window.pointOpenStudentHistory=async function(id){
    switchView('historial');
    await window.pointRefreshStudentHistory();
    select.value=String(id);
    render();
  };
  window.pointRefreshStudentHistory=async function(){
    await loadPayments();
    fill();
  };
  search.addEventListener('input',fill);
  select.addEventListener('change',render);
  from.addEventListener('change',render);
  to.addEventListener('change',render);
  document.getElementById('historialActualizar').addEventListener('click',async()=>{await refreshAll();await window.pointRefreshStudentHistory();});
  document.getElementById('historialExportar').addEventListener('click',()=>{
    if(!select.value)return alert('Elegí un alumno.');
    if(!window.XLSX)return alert('No está disponible la exportación Excel.');
    const id=select.value,s=students.find(x=>String(x.id)===id);
    const cs=classes.filter(c=>String(c.alumno_id)===id&&datesMatch(c.fecha));
    const ps=payments.filter(p=>String(p.alumno_id)===id&&datesMatch(p.fecha_cobro));
    const book=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book,XLSX.utils.json_to_sheet(cs.map(c=>({Alumno:s?.nombre,Fecha:c.fecha,Hora:c.hora,Profesor:tName(c.profesor_id),Asistencia:c.estado||'Pendiente',Pago:paymentForClass(c)?'Asociado':'Sin pago asociado'}))),'Clases');
    XLSX.utils.book_append_sheet(book,XLSX.utils.json_to_sheet(ps.map(p=>({Alumno:s?.nombre,Fecha:p.fecha_cobro,Tipo:p.tipo_pago,Mes:p.mes_abonado,Profesor:tName(p.profesor_id),Medio:p.medio_pago,Importe:p.importe}))),'Pagos');
    XLSX.writeFile(book,'Historial_'+String(s?.nombre||'alumno').replace(/[^a-z0-9 -]/gi,'_')+'.xlsx');
  });
  const observer=new MutationObserver(()=>{if(area.classList.contains('active')){observer.disconnect();window.pointRefreshStudentHistory().finally(()=>observer.observe(area,{attributes:true,attributeFilter:['class']}));}});
  observer.observe(area,{attributes:true,attributeFilter:['class']});
  empty(classBody,'Seleccioná un alumno.',5);empty(payBody,'Seleccioná un alumno.',6);
})();