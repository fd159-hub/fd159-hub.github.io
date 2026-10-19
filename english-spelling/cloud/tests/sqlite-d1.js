// SQL contract adapter, NOT a Cloudflare runtime emulator. Exercises real SQLite.
import {DatabaseSync} from 'node:sqlite';
import {readFileSync, readdirSync} from 'node:fs';
export function database(filename=':memory:',migrate=true){
  const sqlite=new DatabaseSync(filename);sqlite.exec('PRAGMA foreign_keys=ON');
  const db={sqlite,prepare(sql){
    const statement={params:[],bind(...params){return {...this,params}},async all(){return {success:true,results:sqlite.prepare(sql).all(...this.params)}},async first(){return sqlite.prepare(sql).get(...this.params)||null},async run(){const r=sqlite.prepare(sql).run(...this.params);return {success:true,meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}}}};return statement;
  },async batch(statements){
    sqlite.exec('BEGIN');try{const rows=[];for(const s of statements)rows.push(await s.all());sqlite.exec('COMMIT');return rows}catch(e){sqlite.exec('ROLLBACK');throw e}
  }};
  // StatementSync.all handles SELECT and writes; D1's batch always returns results.
  if(migrate)for(const p of readdirSync(new URL('../migrations/',import.meta.url)).filter(p=>p.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL('../migrations/'+p,import.meta.url),'utf8'));
  return db;
}
export function environment(db=database()){
  return {DB:db,ADMIN_PASSWORD:'test-admin-secret-unique',IAN_PIN:'test-student-pin',SESSION_SECRET:'unit-test-signing-secret-32-characters-only',FRONTEND_ORIGIN:'http://localhost:4173'};
}
