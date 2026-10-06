import {normalizeToday,normalizeConfig,normalizeSchoolSchedule,moscowWeekday,moscowMinutes,workoutMatches,freeWindows,minutes,clock,localDate,hasText,DEFAULT_CONFIG,SCHOOL_DAYS} from './model.js';
const $=id=>document.getElementById(id);
let day=null,workout=null,schoolSchedule=null,config=DEFAULT_CONFIG,completed=new Set(),storageOK=true,loading=false,dayScroll=0,workoutVisible=false,completedDate=null,selectedSchoolDay=moscowWeekday();
const DAY_LABELS={monday:['ПН','Понедельник'],tuesday:['ВТ','Вторник'],wednesday:['СР','Среда'],thursday:['ЧТ','Четверг'],friday:['ПТ','Пятница']};
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
const storageKey=()=>`today-planner:v1:${location.pathname}:${day.date}`;
function notice(message){$('notices').append(el('p','notice',message));}
function readCompleted(){const previous=completed;completed=completedDate===day.date?new Set([...previous].filter(x=>day.schedule.some(e=>e.id===x))):new Set();completedDate=day.date;if(!storageOK){$('storage-note').hidden=false;return;}try{const value=JSON.parse(localStorage.getItem(storageKey())||'[]');if(Array.isArray(value)) completed=new Set(value.filter(x=>typeof x==='string'&&day.schedule.some(e=>e.id===x)));}catch{storageOK=false;}$('storage-note').hidden=storageOK;}
function saveCompleted(){try{localStorage.setItem(storageKey(),JSON.stringify([...completed]));}catch{storageOK=false;$('storage-note').hidden=false;}}
async function json(path,nonce,optional=false){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
  try{const r=await fetch(`${path}?v=${nonce}`,{cache:'no-store',signal:controller.signal});if(!r.ok)throw new Error('load');const t=await r.text();if(optional && !t.trim())return null;return JSON.parse(t);}finally{clearTimeout(timer);}
}
function periods(){return [{name:'Утро',start:minutes(config.day_start),end:minutes(config.morning_end)},{name:'День',start:minutes(config.morning_end),end:minutes(config.evening_start)},{name:'Вечер',start:minutes(config.evening_start),end:minutes(config.day_end)}];}
function eventNode(event){
  const row=el('article',`event${event.type==='workout'?' workout':''}${completed.has(event.id)?' done':''}`);
  row.dataset.eventId=event.id;
  const t=el('div','time',event.start);t.append(el('span','',event.end));row.append(t);
  const body=el('div','event-body');body.style.setProperty('--event-height',`${Math.min(116,76+(minutes(event.end)-minutes(event.start))*.16)}px`);
  const top=el('div','event-top'),h=el('h3','',event.title),label=el('label','complete'),input=el('input');
  input.type='checkbox';input.checked=completed.has(event.id);input.setAttribute('aria-label',`Выполнено: ${event.title}`);label.title='Отметить выполненным или снять отметку';
  input.addEventListener('change',()=>{if(input.checked)completed.add(event.id);else completed.delete(event.id);row.classList.toggle('done',input.checked);saveCompleted();});
  label.append(input);top.append(h,label);body.append(top);
  if(event.description)body.append(el('p','event-description',event.description));
  if(event.type==='workout'){
    body.append(el('p','duration',`≈ ${workoutMatches(workout,event,day.date)?workout.duration_minutes:minutes(event.end)-minutes(event.start)} мин`));
    const a=el('a','workout-link','Программа тренировки');a.href='#workout';body.append(a);
  }
  row.append(body);return row;
}
function freeNode(window){const row=el('div','free-slot'),t=el('div','time',clock(window.start));t.append(el('span','',clock(window.end)));row.append(t,el('p','', 'Свободно'));return row;}
function renderDay(){
  const d=new Date(`${day.date}T12:00:00Z`);
  $('weekday').textContent=new Intl.DateTimeFormat('ru',{weekday:'long',timeZone:'Europe/Moscow'}).format(d);
  $('date-title').textContent=new Intl.DateTimeFormat('ru',{day:'numeric',month:'long',timeZone:'Europe/Moscow'}).format(d);
  $('summary').textContent=day.summary;
  $('notices').replaceChildren();
  if(day.is_example)notice('Пример расписания. Замени его своим планом перед использованием.');
  if(day.date!==localDate())notice(`План на ${new Intl.DateTimeFormat('ru',{day:'numeric',month:'long',year:'numeric',timeZone:'Europe/Moscow'}).format(d)}. На сегодня план ещё не обновлён.`);
  if(day.skipped)notice('Часть событий не удалось показать. Остальной план доступен.');
  const overlap=day.schedule.some((e,i)=>day.schedule.slice(0,i).some(p=>minutes(p.end)>minutes(e.start)));
  if(overlap)notice('Некоторые дела пересекаются по времени. Проверь расписание.');
  const ps=periods(),begin=Math.min(ps[0].start,...day.schedule.map(e=>minutes(e.start))),end=Math.max(ps[2].end,...day.schedule.map(e=>minutes(e.end))),span=end-begin;
  const track=el('div','map-track');track.setAttribute('aria-hidden','true');
  for(const e of day.schedule){const n=el('span',`map-busy${e.type==='workout'?' workout':''}`);n.style.left=`${(minutes(e.start)-begin)/span*100}%`;n.style.width=`${(minutes(e.end)-minutes(e.start))/span*100}%`;track.append(n);}
  const labels=el('div','map-labels');labels.append(el('span','',clock(begin)),el('span','','12:00'),el('span','','18:00'),el('span','',clock(end)));$('day-map').replaceChildren(track,labels);
  const timeline=$('timeline');timeline.replaceChildren();
  if(!day.schedule.length){timeline.append(el('p','empty-day','На этот день дел пока нет.'));return;}
  ps[0].start=begin;ps[2].end=end;
  const windows=freeWindows(day.schedule,begin,end,config.min_free_minutes);
  for(const p of ps){
    const section=el('section','period'),heading=el('div','period-heading'),items=el('div','timeline-items');
    heading.append(el('h2','',p.name),el('span','',`${clock(p.start)}–${clock(p.end)}`));
    const entries=day.schedule.filter(e=>minutes(e.start)>=p.start&&minutes(e.start)<p.end).map(e=>({start:minutes(e.start),event:e}));
    for(const w of windows){const s=Math.max(w.start,p.start),t=Math.min(w.end,p.end);if(t-s>=config.min_free_minutes)entries.push({start:s,window:{start:s,end:t}});}
    entries.sort((a,b)=>a.start-b.start);
    for(const entry of entries)items.append(entry.event?eventNode(entry.event):freeNode(entry.window));
    if(!entries.length){const busy=day.schedule.some(e=>minutes(e.start)<p.end&&minutes(e.end)>p.start);items.append(el('p','empty-day',busy?'Продолжается дело из предыдущей части дня.':'Запланированных дел нет.'));}
    section.append(heading,items);timeline.append(section);
  }
}
function renderWorkout(){
  const event=day?.schedule.find(e=>e.type==='workout'),content=$('workout-content');content.replaceChildren();$('workout-duration').textContent='';
  if(!event){$('workout-title').textContent='На сегодня тренировки нет';return;}
  if(!workoutMatches(workout,event,day.date)){$('workout-title').textContent='Программа пока недоступна';content.append(el('p','notice','План дня доступен. Попробуй обновить страницу позже.'));return;}
  $('workout-title').textContent=workout.title;$('workout-duration').textContent=`≈ ${workout.duration_minutes} минут`;
  if(day.is_example||workout.is_example)content.append(el('p','notice','Пример отображения программы. Это не назначенная тебе тренировка.'));
  for(const [key,title] of [['warmup','Разминка'],['main','Основная часть'],['cooldown','Заминка']]){
    const entries=Array.isArray(workout[key])?workout[key].filter(x=>x&&hasText(x.name)):[];if(!entries.length)continue;
    const section=el('section','workout-section');section.append(el('h2','',title));
    entries.forEach((exercise,i)=>{
      const row=el('article','exercise'),body=el('div');row.append(el('span','exercise-index',String(i+1).padStart(2,'0')));body.append(el('h3','',exercise.name));
      if(Number.isInteger(exercise.sets)&&exercise.sets>0&&hasText(exercise.reps))body.append(el('p','exercise-dose',`${exercise.sets} × ${exercise.reps}`));
      if(Number.isInteger(exercise.duration_minutes)&&exercise.duration_minutes>0)body.append(el('p','exercise-dose',`${exercise.duration_minutes} мин`));
      if(Number.isInteger(exercise.rest_sec)&&exercise.rest_sec>=0)body.append(el('p','exercise-rest',`Отдых ${exercise.rest_sec} сек`));
      if(hasText(exercise.note))body.append(el('p','exercise-note',exercise.note));row.append(body);section.append(row);
    });content.append(section);
  }
}
function renderSchoolSchedule(){
  const notice=$('schedule-notice'),switcher=$('weekday-switcher'),lessons=$('school-lessons');
  notice.replaceChildren();switcher.replaceChildren();lessons.replaceChildren();
  if(!schoolSchedule){notice.append(el('p','notice','Не удалось загрузить школьное расписание. План на сегодня продолжает работать.'));return;}
  const currentDay=moscowWeekday(),nowMinutes=moscowMinutes();
  for(const dayName of SCHOOL_DAYS){
    const button=el('button','weekday-button',DAY_LABELS[dayName][0]);button.type='button';
    button.dataset.day=dayName;button.setAttribute('aria-label',DAY_LABELS[dayName][1]);button.setAttribute('aria-pressed',String(dayName===selectedSchoolDay));
    if(dayName===currentDay)button.classList.add('is-today');
    button.addEventListener('click',()=>{selectedSchoolDay=dayName;renderSchoolSchedule();});switcher.append(button);
  }
  const heading=el('div','school-day-heading');heading.append(el('h2','',DAY_LABELS[selectedSchoolDay][1]),el('span','',`${schoolSchedule.weekdays[selectedSchoolDay].length} уроков`));lessons.append(heading);
  for(const lesson of schoolSchedule.weekdays[selectedSchoolDay]){
    const active=selectedSchoolDay===currentDay && nowMinutes>=minutes(lesson.start) && nowMinutes<minutes(lesson.end);
    const row=el('article',`school-lesson${active?' is-current':''}`);row.dataset.lesson=String(lesson.number);
    row.append(el('span','lesson-number',String(lesson.number)));
    const body=el('div','lesson-body');body.append(el('p','lesson-time',`${lesson.start}–${lesson.end}`),el('h3','',lesson.subject));
    if(active)body.append(el('span','current-lesson-label','Сейчас'));row.append(body);lessons.append(row);
  }
}
function route(){
  const routeName=location.hash==='#workout'?'workout':location.hash==='#schedule'?'schedule':'today';
  const showWorkout=routeName==='workout',showSchedule=routeName==='schedule';
  if(showWorkout&&!workoutVisible)dayScroll=window.scrollY;
  $('day-view').hidden=routeName!=='today';$('workout-view').hidden=!showWorkout;$('schedule-view').hidden=!showSchedule;
  document.querySelectorAll('[data-route]').forEach(link=>{const active=link.dataset.route===routeName;link.classList.toggle('is-active',active);if(active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');});
  if(showWorkout){renderWorkout();document.title='Тренировка · Сегодня';if(!workoutVisible){window.scrollTo(0,0);$('workout-view').focus({preventScroll:true});}}
  else if(showSchedule){renderSchoolSchedule();document.title='Расписание · Сегодня';if(workoutVisible||window.scrollY>0)window.scrollTo(0,0);}
  else{document.title='Сегодня';if(workoutVisible)window.scrollTo(0,dayScroll);}
  workoutVisible=showWorkout;
}
async function load(){
  if(loading)return;loading=true;$('refresh').disabled=true;
  try{
    const nonce=Date.now();
    const results=await Promise.allSettled([json('data/today.json',nonce),json('data/config.json',nonce),json('data/workout.json',nonce,true),json('data/school-schedule.json',nonce)]);
    if(results[0].status!=='fulfilled')throw new Error('day unavailable');
    const next=normalizeToday(results[0].value);day=next;config=normalizeConfig(results[1].status==='fulfilled'?results[1].value:null);workout=results[2].status==='fulfilled'?results[2].value:null;
    try{schoolSchedule=results[3].status==='fulfilled'?normalizeSchoolSchedule(results[3].value):null;}catch{schoolSchedule=null;}
    readCompleted();renderDay();route();
    if(results[1].status!=='fulfilled')notice('План показан с обычными границами дня.');
  }catch{
    if(day){notice('Не удалось обновить план. Показана ранее загруженная версия.');}
    else{$('summary').textContent='Не удалось загрузить план дня.';$('notices').replaceChildren();notice('Попробуй нажать «Обновить» чуть позже.');$('day-map').replaceChildren();$('timeline').replaceChildren();route();}
  }finally{loading=false;$('refresh').disabled=false;}
}
$('refresh').addEventListener('click',load);window.addEventListener('hashchange',route);
window.addEventListener('storage',e=>{if(day&&e.key===storageKey()){readCompleted();renderDay();}});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});
load();
