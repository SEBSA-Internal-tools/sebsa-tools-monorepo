-- Repair active first attempts that were incorrectly finalized by the former hard-coded retry
-- threshold. A first attempt is final only when it passed the cycle's configured pass mark.

with affected as (
  update assessment_attempts a
     set is_final = false
    from assessment_cycles c
   where a.cycle_id = c.id
     and c.status = 'active'
     and a.attempt_number = 1
     and a.passed = false
     and a.score < c.passing_score
     and a.is_final = true
     and not exists (
       select 1 from assessment_attempts second_attempt
        where second_attempt.user_id = a.user_id
          and second_attempt.cycle_id = a.cycle_id
          and second_attempt.attempt_number = 2
     )
  returning a.user_id, a.cycle_id
)
update assessment_invitations invitation
   set status = 'opened',
       expires_at = greatest(invitation.expires_at, now() + interval '7 days')
  from affected
 where invitation.user_id = affected.user_id
   and invitation.cycle_id = affected.cycle_id
   and invitation.status = 'completed';
