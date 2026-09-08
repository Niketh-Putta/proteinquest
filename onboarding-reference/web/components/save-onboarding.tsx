'use client';
import { useEffect, useState } from 'react';
import { proteinQuestAuth } from '@/lib/proteinquest-auth';
import { dailyNutritionTargets } from '@/lib/onboarding-flow';

export function SaveOnboarding({ answers, onSaved }: {
  answers: Record<string,string|number|boolean>; onSaved: () => void;
}) {
  const [attempt,setAttempt]=useState(0);
  const [status,setStatus]=useState('Saving your plan…');
  const [failed,setFailed]=useState(false);
  useEffect(()=>{
    let active=true;
    async function save() {
      setFailed(false);setStatus('Saving your plan…');
      const {data:{user},error:authError}=await proteinQuestAuth.auth.getUser();
      if(authError||!user||user.is_anonymous) throw new Error('Sign in again to save your plan.');
      const {data:profile,error:readError}=await proteinQuestAuth.from('profiles').select('id,retention').eq('id',user.id).maybeSingle();
      if(readError) throw readError;
      const keys=['sex','workouts','birthday','discovery','previous','height','weight','target','heightUnit','weightUnit','trainer','goal','pace','obstacles','diet','motivation','rollover','notifications','tracking','referral','terms','marketing'];
      const clean=Object.fromEntries(keys.filter(k=>answers[k]!==undefined).map(k=>[k,answers[k]]));
      const signature=JSON.stringify(clean);
      // An already saved browser draft must not overwrite later edits from the app.
      if(localStorage.getItem('proteinquest-saved-'+user.id)===signature){if(active){setStatus('Plan saved to your account.');onSaved();}return;}
      if(!clean.sex||!clean.goal||!clean.workouts||!clean.terms) throw new Error('Complete your onboarding details before saving.');
      const birthday=String(clean.birthday);
      const birth=new Date(birthday+'T00:00:00');
      const now=new Date();
      const age=now.getFullYear()-birth.getFullYear()-(now.getMonth()<birth.getMonth()||(now.getMonth()===birth.getMonth()&&now.getDate()<birth.getDate())?1:0);
      const targets=dailyNutritionTargets({sex:String(clean.sex),birthday,heightCm:Number(clean.height),weightKg:Number(clean.weight),targetKg:Number(clean.target),goal:String(clean.goal),workouts:String(clean.workouts),paceKgPerWeek:Number(clean.pace)});
      if(!Number.isFinite(age)||age<18||![targets.calories,targets.protein].every(Number.isFinite)) throw new Error('Please review your age and nutrition details.');
      const updates={
        age,weight_kg:Number(clean.weight),weight_unit:clean.weightUnit==='lbs'?'lbs':'kg',
        sex:clean.sex==='Male'?'male':clean.sex==='Female'?'female':null,
        activity_level:clean.workouts==='6+'?'active':clean.workouts==='3–5'?'moderate':'light',
        goal_type:clean.goal==='Lose weight'?'lose_fat':clean.goal==='Gain weight'?'build_muscle':'maintain',
        protein_goal_g:targets.protein,
        retention:{...(profile?.retention??{}),onboarding:clean,calorie_goal_kcal:targets.calories},
        onboarded:true
      };
      const result=profile
        ?await proteinQuestAuth.from('profiles').update(updates).eq('id',user.id).select('id').single()
        :await proteinQuestAuth.from('profiles').insert({id:user.id,...updates}).select('id').single();
      if(result.error) throw result.error;
      localStorage.setItem('proteinquest-saved-'+user.id,signature);
      if(active){setStatus('Plan saved to your account.');onSaved();}
    }
    void save().catch(e=>{if(active){setFailed(true);setStatus(e?.message||'Could not save. Your answers are still on this device.');}});
    return()=>{active=false};
  },[attempt]); // This mounted screen saves one submitted snapshot, never preview edits.
  return <div role="status"><p>{status}</p>{failed&&<button className="outline" onClick={()=>setAttempt(v=>v+1)}>Retry saving</button>}</div>;
}
