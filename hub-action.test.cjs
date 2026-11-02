const {test}=require('node:test'),assert=require('node:assert/strict'),C=require('./hub-action-core.js');
test('ordena prioridad y vencimiento antes de tareas cerradas',()=>{const base={fecha:'2026-10-30',hora:'09:00',estado:'Pendiente'};const rows=[{...base,id:'a',prioridad:4},{...base,id:'b',prioridad:1,estado:'Confirmada'},{...base,id:'c',prioridad:2},{...base,id:'d',prioridad:1}];assert.deepEqual(rows.sort(C.compare).map(r=>r.id),['d','c','a','b']);});
test('respeta límites de turnos con Tamy',()=>{for(const [responsable,hora]of [['Clari','08:00'],['Clari','15:59'],['Tamy','16:00'],['Tamy','21:59']])assert.doesNotThrow(()=>C.validate({titulo:'Contactar',fecha:'2026-10-30',responsable,hora}));for(const [responsable,hora]of [['Clari','16:00'],['Tamy','15:59'],['Tamy','22:00'],['Tamo','18:00']])assert.throws(()=>C.validate({titulo:'Contactar',fecha:'2026-10-30',responsable,hora}));});
test('WhatsApp codifica texto y rechaza teléfono incompleto',()=>{assert.equal(C.whatsapp('123','Hola'),null);assert.equal(C.whatsapp('+54 9 11 1234 5678','Hola & ¿venís?'),'https://wa.me/5491112345678?text='+encodeURIComponent('Hola & ¿venís?'));});
test('no reactiva alumnos inactivos ni personas con una próxima clase',()=>{const students=[{id:'a',nombre:'Ana'},{id:'b',nombre:'Bea',activo:false},{id:'c',nombre:'Clara'}];const classes=students.map(s=>({id:s.id,alumno_id:s.id,fecha:'2026-10-23',estado:'Canceló'}));classes.push({id:'next',alumno_id:'c',fecha:'2026-10-30',estado:'Pendiente'});assert.deepEqual(C.suggest('2026-10-30',students,classes).map(s=>s.nombre),['Ana']);});
test('una clase posterior realizada evita falso seguimiento de cancelación',()=>{const classes=[{id:'a',alumno_id:'1',fecha:'2026-10-23',estado:'Canceló'},{id:'b',alumno_id:'1',fecha:'2026-10-28',estado:'Presente'}];assert.equal(C.suggest('2026-10-30',[{id:'1',nombre:'Ana'}],classes).length,0);});
test('reactivación sólo usa historial entre 21 y 90 días',()=>{const students=[{id:'1',nombre:'Ana'}];assert.equal(C.suggest('2026-10-30',students,[{id:'a',alumno_id:'1',fecha:'2026-10-01',estado:'Presente'}]).length,1);assert.equal(C.suggest('2026-10-30',students,[{id:'a',alumno_id:'1',fecha:'2026-01-01',estado:'Presente'}]).length,0);});
test('coach une fichas, respeta bajas y evita repetir contacto abierto o cerrado recientemente',()=>{
 const s=[{id:'a',nombre:'Ana',telefono:'5491112345678'},{id:'b',nombre:'Bea',activo:false}],p=[{id:1,alumno_id:'a',nombre:'Ana',categoria:'7ma'},{id:2,alumno_id:'b',nombre:'Bea'}];
 assert.equal(C.contacts(s,p).length,1);assert.equal(C.contacts(s,p)[0].categoria,'7ma');
 assert.equal(C.coach('2026-11-02',s,[],p).length,1);
 for(const t of [{contacto:'Ana',estado:'Enviado'},{alumno_id:'a',estado:'Cerrada',actualizado:'2026-11-01T20:00:00Z'}])assert.equal(C.coach('2026-11-02',s,[],p,[t]).length,0);
});
test('coach cambia el seguimiento ante una reserva nueva',()=>{
 const s=[{id:'a',nombre:'Ana',telefono:'5491112345678'}],c=[{id:'c',alumno_id:'a',fecha:'2026-10-28',estado:'Canceló'}];
 assert.match(C.coach('2026-11-02',s,c)[0].titulo,/Retomar/);
 assert.equal(C.coach('2026-11-02',s,[...c,{id:'next',alumno_id:'a',fecha:'2026-11-03',estado:'Pendiente'}]).some(x=>x.titulo.startsWith('Retomar')),false);
});
test('coach respeta cupos, categoría y participantes sin prometer disponibilidad',()=>{
 const p=[{id:1,nombre:'Ana',telefono:'5491112345678',categoria:'7 ma',sexo:'Femenino'},{id:2,nombre:'Bea',telefono:'5491187654321',categoria:'7',sexo:'Femenino'}];
 const e={id:'e',fecha:'2026-11-03',hora_inicio:'19:00:00',tipo:'Femenina',categoria:'7ma',estado:'Activa',cupo_maximo:4,valor_por_jugador:15000},a=[{cancha_abierta_id:'e',nombre:'Bea'}];
 const invites=C.coach('2026-11-02',[],[],p,[],[e],a).filter(x=>x.key.startsWith('abierta:'));
 assert.equal(invites.length,1);assert.equal(invites[0].nombre,'Ana');assert.match(invites[0].mensaje,/consultando interés/);assert.match(invites[0].steps[1],/Wona/);
 for(const changed of [{...e,cupo_maximo:1},{...e,categoria:'Suma 14'},{...e,estado:'Cancelada'}])assert.equal(C.coach('2026-11-02',[],[],p,[],[changed],a).filter(x=>x.key.startsWith('abierta:')).length,0);
});
test('coach rota cinco consultas concretas sin inventar horarios ni precios',()=>{
 const s=Array.from({length:8},(_,i)=>({id:String(i),nombre:'Persona '+i,telefono:'54911123456'+String(i).padStart(2,'0')})),ideas=C.coach('2026-11-02',s,[]);
 assert.equal(ideas.length,5);assert.equal(new Set(ideas.map(x=>x.alumno_id)).size,5);assert.ok(ideas.every(x=>x.steps.length===4&&x.mensaje.includes('días y horarios')&&!x.mensaje.includes('$')));
 assert.notDeepEqual(ideas.map(x=>x.alumno_id).sort(),C.coach('2026-11-03',s,[]).map(x=>x.alumno_id).sort());
 assert.equal(C.coach('2026-11-02',[{id:'a',nombre:'Sin teléfono'}],[]).length,0);
});
test('listas comparten un cliente en varias actividades y categorías sin duplicarlo',()=>{
 const p={actividades:['Clases','Torneos'],categorias:['7ma','6ta'],dias:['Martes'],modalidad:'Femenino',activo:true};
 const rows=[{id:'1',contacto:'Ana',telefono:'5491112345678',actualizado:'2026-11-01',intereses:p},{id:'2',contacto:'Ana',telefono:'+54 9 11 1234 5678',alumno_id:'a',actualizado:'2026-11-02',intereses:p}];
 assert.equal(C.interestedContacts(rows).length,1);assert.equal(C.interestLists(rows).length,4);
 assert.equal(C.interestLists(rows,{actividad:'Clases',categoria:'7ma',dia:'Martes'}).length,1);assert.equal(C.interestLists(rows,{dia:'Lunes'}).length,0);
 assert.equal(C.interestLists(rows,{modalidad:'Masculino'}).length,0);
});
test('actualizar, pausar o vaciar intereses reemplaza listas viejas; cerrar tarea conserva preferencias',()=>{
 const first={id:'a',alumno_id:'x',contacto:'Ana',actualizado:'2026-11-01',intereses:{actividades:['Clases'],categorias:['7ma']}};
 const latest={...first,id:'b',actualizado:'2026-11-02',estado:'Cerrada',intereses:{actividades:['Partidos'],categorias:['6ta']}};
 assert.match(C.interestLists([first,latest])[0].titulo,/Partidos · 6ta/);assert.equal(C.interestLists([first,{...latest,intereses:{actividades:['Partidos'],activo:false}}]).length,0);
 assert.equal(C.interestLists([first,{...latest,intereses:{actividades:[]}}]).length,0);
 assert.match(C.interestLists([first,{...latest,intereses:null}])[0].titulo,/Clases/);
});
test('no fusiona homónimos ni inventa categorías; valida rango horario',()=>{
 const rows=['a','b'].map(id=>({id,contacto:'Ana',alumno_id:id,intereses:{actividades:['Clases']}}));assert.equal(C.interestLists(rows)[0].personas.length,2);assert.match(C.interestLists(rows)[0].titulo,/A confirmar/);
 assert.throws(()=>C.validateInterests({desde:'20:00',hasta:'19:00'}),/posterior/);
 assert.deepEqual(C.cleanInterests({actividades:['Inventada','Clases'],categorias:['7ma','7ma']}).actividades,['Clases']);
});
