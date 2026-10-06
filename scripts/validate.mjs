// Dependency-free validator for the JSON Schema subset used by this project.
import {readFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {isDate,minutes} from '../js/model.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
let errors=[];
function validate(value,schema,path){
  const fail=message=>errors.push(`${path}: ${message}`);
  if(schema.anyOf){const original=errors;let valid=false;for(const branch of schema.anyOf){errors=[];validate(value,branch,path);if(!errors.length)valid=true;}errors=original;if(!valid)fail('не соответствует ни одному допустимому варианту');}
  if(Object.hasOwn(schema,'const') && value!==schema.const)fail(`ожидалось ${schema.const}`);
  if(schema.enum && !schema.enum.includes(value))fail('недопустимое значение');
  const types={null:value===null,object:value!==null&&typeof value==='object'&&!Array.isArray(value),array:Array.isArray(value),string:typeof value==='string',integer:Number.isInteger(value),boolean:typeof value==='boolean'};
  if(schema.type && !types[schema.type]){fail(`ожидался тип ${schema.type}`);return;}
  if(typeof value==='string'){
    if(schema.minLength!==undefined && [...value].length<schema.minLength)fail('слишком короткое значение');
    if(schema.maxLength!==undefined && [...value].length>schema.maxLength)fail('слишком длинное значение');
    if(schema.pattern && !new RegExp(schema.pattern,'u').test(value))fail('неверный формат');
    if(schema.format==='date' && !isDate(value))fail('несуществующая дата');
  }
  if(typeof value==='number'){
    if(schema.minimum!==undefined&&value<schema.minimum)fail('меньше минимума');
    if(schema.maximum!==undefined&&value>schema.maximum)fail('больше максимума');
  }
  if(Array.isArray(value)){
    if(schema.minItems!==undefined&&value.length<schema.minItems)fail('слишком мало элементов');
    if(schema.maxItems!==undefined&&value.length>schema.maxItems)fail('слишком много элементов');
    if(schema.uniqueItems && new Set(value.map(v=>JSON.stringify(v))).size!==value.length)fail('повторяющиеся элементы');
    if(schema.items)value.forEach((item,i)=>validate(item,schema.items,`${path}[${i}]`));
  }
  if(types.object){
    for(const key of schema.required||[])if(!Object.hasOwn(value,key))fail(`нет обязательного поля ${key}`);
    for(const [key,item] of Object.entries(value)){
      if(schema.properties && Object.hasOwn(schema.properties,key))validate(item,schema.properties[key],`${path}.${key}`);
      else if(schema.additionalProperties===false)fail(`неизвестное поле ${key}`);
    }
  }
}
const data={};
for(const name of ['today','workout','workout-history','config']){
  try{data[name]=JSON.parse(await readFile(resolve(root,`data/${name}.json`),'utf8'));const schema=JSON.parse(await readFile(resolve(root,`schemas/${name}.schema.json`),'utf8'));validate(data[name],schema,`data/${name}.json`);}catch{errors.push(`data/${name}.json: файл недоступен или JSON некорректен`);}
}
if(!errors.length){
  const t=data.today,w=data.workout,h=data['workout-history'],c=data.config;
  const unique=(values,path)=>{if(new Set(values).size!==values.length)errors.push(`${path}: повторяющиеся id`);};
  unique(t.schedule.map(e=>e.id),'today.schedule');
  for(const [i,e] of t.schedule.entries()){
    if(minutes(e.start)>=minutes(e.end))errors.push(`schedule[${i}]: end должен быть позже start, переход через полночь не поддерживается`);
    if(i>0 && minutes(t.schedule[i-1].start)>minutes(e.start))errors.push('schedule: сортируй события по start');
    if(e.type==='workout'&&!e.workout_id)errors.push(`schedule[${i}]: тренировке нужен workout_id`);
    if(e.type!=='workout'&&e.workout_id)errors.push(`schedule[${i}]: workout_id допустим только для тренировки`);
  }
  const workouts=t.schedule.filter(e=>e.type==='workout');
  if(workouts.length>1)errors.push('В первой версии допустима одна тренировка в день');
  if(!workouts.length && w!==null)errors.push('Без тренировки workout.json должен содержать null');
  if(workouts.length && (!w||w.id!==workouts[0].workout_id||w.date!==t.date))errors.push('workout должен совпадать с today по date и workout_id');
  if(w && Boolean(w.is_example)!==Boolean(t.is_example))errors.push('Признак is_example должен совпадать в today и workout');
  if(w && w.duration_minutes>minutes(workouts[0]?.end||'00:00')-minutes(workouts[0]?.start||'00:00'))errors.push('Программа длиннее окна тренировки');
  if(!(minutes(c.day_start)<minutes(c.morning_end)&&minutes(c.morning_end)<minutes(c.evening_start)&&minutes(c.evening_start)<minutes(c.day_end)))errors.push('config: требуется day_start < morning_end < evening_start < day_end');
  unique(h.sessions.map(s=>s.id),'history.sessions');
  let last='';
  for(const s of h.sessions){if(s.date<last)errors.push('history: сортируй sessions по дате от старых к новым');last=s.date;if(s.date>t.date)errors.push('history: запись не может быть позже даты плана');}
  for(const e of [...(w?[...w.warmup,...w.main,...w.cooldown]:[]),...h.sessions.flatMap(s=>s.exercises)])if(Object.hasOwn(e,'sets')!==Object.hasOwn(e,'reps'))errors.push('sets и reps указываются вместе');
  for(let i=0;i<t.schedule.length;i++)if(t.schedule.slice(0,i).some(e=>minutes(e.end)>minutes(t.schedule[i].start)))console.warn(`Предупреждение: пересечение времени у ${t.schedule[i].id}`);
}
if(errors.length){for(const error of errors)console.error(error);process.exitCode=1;}else console.log('OK: 4 JSON-файла, схемы и связи данных проверены.');
