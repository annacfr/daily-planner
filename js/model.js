export const TYPES = ['school','study','work','home','personal','workout'];
export const GROUPS = ['quadriceps','hamstrings','glutes','back','chest','arms','core','cardio','mobility','full_body'];
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
