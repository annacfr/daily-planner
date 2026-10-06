export const TYPES = ['school','study','work','home','personal','workout'];
export const GROUPS = ['quadriceps','hamstrings','glutes','back','chest','arms','core','cardio','mobility','full_body'];
export const SCHOOL_DAYS = ['monday','tuesday','wednesday','thursday','friday'];
export const DEFAULT_CONFIG = Object.freeze({schema_version:1,timezone:'Europe/Moscow',day_start:'07:00',day_end:'23:00',morning_end:'12:00',evening_start:'18:00',min_free_minutes:20});
export const isDate = value => {
  if(typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0,10) === value;
};
export const isTime = value => typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
export const minutes = value => Number(value.slice(0,2))*60 + Number(value.slice(3,5));
export const clock = value => `${String(Math.floor(value/60)).padStart(2,'0')}:${String(value%60).padStart(2,'0')}`;
export const hasText = value => typeof value === 'string' && value.trim().length > 0;
export function normalizeToday(raw){
  if(!raw || raw.schema_version!==1 || !isDate(raw.date) || !Array.isArray(raw.schedule)) throw new Error('invalid day');
  const seen=new Set(), events=[];let skipped=0;
  for(const event of raw.schedule){
    if(!event || !hasText(event.id) || seen.has(event.id) || !hasText(event.title) || !isTime(event.start) || !isTime(event.end) || minutes(event.start)>=minutes(event.end) || !TYPES.includes(event.type)) {skipped++;continue;}
    seen.add(event.id);
    events.push({id:event.id,start:event.start,end:event.end,title:event.title,type:event.type,...(hasText(event.description)?{description:event.description}:{}),...(hasText(event.workout_id)?{workout_id:event.workout_id}:{})});
  }
  events.sort((a,b)=>minutes(a.start)-minutes(b.start)||minutes(a.end)-minutes(b.end));
  return {date:raw.date,summary:hasText(raw.summary)?raw.summary:'План дня',is_example:raw.is_example===true,schedule:events,skipped};
}
export function normalizeConfig(raw){
  const c={...DEFAULT_CONFIG};if(!raw || raw.schema_version!==1) return c;
  for(const k of ['day_start','day_end','morning_end','evening_start']) if(isTime(raw[k])) c[k]=raw[k];
  if(!(minutes(c.day_start)<minutes(c.morning_end) && minutes(c.morning_end)<minutes(c.evening_start) && minutes(c.evening_start)<minutes(c.day_end))) return {...DEFAULT_CONFIG};
  if(Number.isInteger(raw.min_free_minutes)&&raw.min_free_minutes>=1&&raw.min_free_minutes<=120)c.min_free_minutes=raw.min_free_minutes;
  // The planner contract always uses Moscow civil time.
  return c;
}
export function workoutMatches(raw,event,date){
  return !!(raw && raw.schema_version===1 && raw.date===date && raw.id===event.workout_id && hasText(raw.title) && Number.isInteger(raw.duration_minutes)&&raw.duration_minutes>0&&Array.isArray(raw.main)&&raw.main.length>0);
}
export function freeWindows(events,start,end,minGap){
  let cursor=start;const windows=[];
  for(const e of events){const s=Math.max(start,minutes(e.start)),t=Math.min(end,minutes(e.end));if(t<=start||s>=end)continue;if(s-cursor>=minGap)windows.push({start:cursor,end:s});cursor=Math.max(cursor,t);}
  if(end-cursor>=minGap)windows.push({start:cursor,end});return windows;
}
export function localDate(now=new Date()){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const get=k=>parts.find(p=>p.type===k).value;return `${get('year')}-${get('month')}-${get('day')}`;
}
export function normalizeSchoolSchedule(raw){
  if(!raw || raw.schema_version!==1 || raw.timezone!=='Europe/Moscow' || !Array.isArray(raw.lesson_times) || !raw.weekdays || typeof raw.weekdays!=='object') throw new Error('invalid school schedule');
  const times=new Map();
  for(const slot of raw.lesson_times){
    if(!slot || !Number.isInteger(slot.number) || slot.number<1 || slot.number>12 || times.has(slot.number) || !isTime(slot.start) || !isTime(slot.end) || minutes(slot.start)>=minutes(slot.end)) throw new Error('invalid lesson time');
    times.set(slot.number,{number:slot.number,start:slot.start,end:slot.end});
  }
  const sortedTimes=[...times.values()].sort((a,b)=>a.number-b.number);
  for(let i=0;i<sortedTimes.length;i++){
    if(sortedTimes[i].number!==i+1 || (i>0 && minutes(sortedTimes[i-1].end)>minutes(sortedTimes[i].start))) throw new Error('invalid lesson time order');
  }
  const weekdays={};
  for(const day of SCHOOL_DAYS){
    if(!Array.isArray(raw.weekdays[day])) throw new Error('missing weekday');
    const seen=new Set();
    weekdays[day]=raw.weekdays[day].map(lesson=>{
      if(!lesson || !Number.isInteger(lesson.number) || seen.has(lesson.number) || !times.has(lesson.number) || !hasText(lesson.subject)) throw new Error('invalid lesson');
      seen.add(lesson.number);const slot=times.get(lesson.number);
      return {number:lesson.number,subject:lesson.subject,start:slot.start,end:slot.end};
    }).sort((a,b)=>a.number-b.number);
    for(let i=0;i<weekdays[day].length;i++)if(weekdays[day][i].number!==i+1)throw new Error('lesson numbers must be sequential');
  }
  return {timezone:raw.timezone,weekdays};
}
export function moscowWeekday(now=new Date()){
  const label=new Intl.DateTimeFormat('en-US',{timeZone:'Europe/Moscow',weekday:'long'}).format(now).toLowerCase();
  return SCHOOL_DAYS.includes(label)?label:'monday';
}
export function moscowMinutes(now=new Date()){
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Moscow',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now);
  const get=k=>Number(parts.find(p=>p.type===k).value);return get('hour')*60+get('minute');
}
