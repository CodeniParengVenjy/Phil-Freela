-- Test for supabase_super_admin_schema.sql. Paste this whole file into the
-- Supabase SQL Editor and run it AFTER the schema file. It makes made-up
-- accounts, acts as each one, and ends with an error that carries the
-- PASS/FAIL list; that error rolls everything back, so nothing is left behind.
do $t$
declare
  res text := '';
  sa uuid := gen_random_uuid();   -- a super admin
  a1 uuid := gen_random_uuid();   -- a plain admin
  a2 uuid := gen_random_uuid();   -- another plain admin
  u uuid := gen_random_uuid();    -- a normal user
  n int;
  r text;
  real_admins int := (select count(*) from public.admins);
begin
  insert into auth.users (id, email, aud, role, created_at)
  select x, 'sa-' || left(x::text, 8) || '@example.invalid', 'authenticated', 'authenticated', now() from unnest(array[sa, a1, a2, u]) as x;
  insert into public.admins (id, full_name, username, role) values
    (sa, 'Super', 'sa_test', 'super_admin'), (a1, 'Admin One', 'a1_test', 'admin'), (a2, 'Admin Two', 'a2_test', 'admin');
  insert into public.profiles (id, full_name, username, gender, account_type, email_when_offline) values (u, 'Normal User', 'su_test', 'male', 'client', false);

  set local role authenticated;

  -- ===== A plain admin =====
  perform set_config('request.jwt.claim.sub', a1::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', a1, 'role', 'authenticated')::text, true);
  res := res || E'\n' || case when public.is_admin() and not public.is_super_admin() then 'PASS  ' else 'FAIL  ' end || '1a. a plain admin is an admin but not a super admin';
  select count(*) into n from public.admins;
  -- 3 made-up admins plus the real admin(s) already on the live project.
  res := res || E'\n' || case when n = 3 + real_admins then 'PASS  ' else 'FAIL  ' end || '1b. a plain admin can still read the admin list';
  begin
    insert into public.admins (id, full_name, username) values (gen_random_uuid(), 'X', 'x_test');
    res := res || E'\nFAIL  1c. a plain admin added an admin';
  exception when others then res := res || E'\nPASS  1c. a plain admin cannot add an admin';
  end;
  begin perform public.remove_admin(a2); res := res || E'\nFAIL  1d. a plain admin removed an admin';
  exception when others then res := res || E'\n' || case when sqlerrm = 'Only a super admin can remove admins.' then 'PASS  ' else 'FAIL  ' end || '1d. a plain admin cannot remove an admin: ' || sqlerrm; end;
  begin perform public.set_admin_role(a2, 'super_admin'); res := res || E'\nFAIL  1e. a plain admin promoted someone';
  exception when others then res := res || E'\n' || case when sqlerrm = 'Only a super admin can change admin roles.' then 'PASS  ' else 'FAIL  ' end || '1e. a plain admin cannot promote: ' || sqlerrm; end;
  begin perform public.delete_user(u); res := res || E'\nFAIL  1f. a plain admin deleted a user';
  exception when others then res := res || E'\n' || case when sqlerrm = 'Only a super admin can delete users.' then 'PASS  ' else 'FAIL  ' end || '1f. a plain admin cannot delete a user: ' || sqlerrm; end;

  -- ===== A normal user =====
  perform set_config('request.jwt.claim.sub', u::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  res := res || E'\n' || case when not public.is_super_admin() and not public.is_admin() then 'PASS  ' else 'FAIL  ' end || '2a. a normal user is neither';
  begin perform public.delete_user(sa); res := res || E'\nFAIL  2b. a normal user deleted someone';
  exception when others then res := res || E'\nPASS  2b. a normal user cannot call delete_user'; end;

  -- ===== The super admin =====
  perform set_config('request.jwt.claim.sub', sa::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', sa, 'role', 'authenticated')::text, true);
  res := res || E'\n' || case when public.is_super_admin() and public.is_admin() then 'PASS  ' else 'FAIL  ' end || '3a. a super admin is also an admin';
  begin
    insert into public.admins (id, full_name, username, role) values (gen_random_uuid(), 'Y', 'y_test', 'super_admin');
    res := res || E'\nFAIL  3b. a super admin was made by inserting';
  exception when others then res := res || E'\nPASS  3b. a super admin cannot be created by inserting (only by promoting)'; end;
  update public.admins set role = 'super_admin' where id = a1;
  get diagnostics n = row_count;
  res := res || E'\n' || case when n = 0 then 'PASS  ' else 'FAIL  ' end || '3c. the role can't be edited directly on the table (0 rows)';
  perform public.set_admin_role(a1, 'super_admin');
  reset role; select role into r from public.admins where id = a1; set local role authenticated;
  res := res || E'\n' || case when r = 'super_admin' then 'PASS  ' else 'FAIL  ' end || '3d. promote works';
  perform public.set_admin_role(a1, 'admin');
  reset role; select role into r from public.admins where id = a1; set local role authenticated;
  res := res || E'\n' || case when r = 'admin' then 'PASS  ' else 'FAIL  ' end || '3e. demote works';
  begin perform public.set_admin_role(sa, 'admin'); res := res || E'\nFAIL  3f. changed own role';
  exception when others then res := res || E'\n' || case when sqlerrm = 'You cannot change your own role.' then 'PASS  ' else 'FAIL  ' end || '3f. cannot change your own role: ' || sqlerrm; end;
  begin perform public.set_admin_role(a1, 'boss'); res := res || E'\nFAIL  3g. a made-up role was accepted';
  exception when others then res := res || E'\nPASS  3g. a made-up role is refused'; end;
  begin perform public.remove_admin(sa); res := res || E'\nFAIL  3h. removed own account';
  exception when others then res := res || E'\n' || case when sqlerrm = 'You cannot remove your own admin account.' then 'PASS  ' else 'FAIL  ' end || '3h. cannot remove yourself: ' || sqlerrm; end;
  begin perform public.delete_user(a1); res := res || E'\nFAIL  3i. deleted an admin as a user';
  exception when others then res := res || E'\n' || case when sqlerrm like 'Admins are removed from the Admins page%' then 'PASS  ' else 'FAIL  ' end || '3i. admins are removed from the Admins page, not by delete_user'; end;
  perform public.remove_admin(a2);
  reset role; select count(*) into n from public.admins where id = a2; set local role authenticated;
  res := res || E'\n' || case when n = 0 then 'PASS  ' else 'FAIL  ' end || '3j. a super admin removes a plain admin';
  perform public.delete_user(u);
  reset role; select count(*) into n from public.profiles where id = u; set local role authenticated;
  res := res || E'\n' || case when n = 0 then 'PASS  ' else 'FAIL  ' end || '3k. a super admin deletes a user';

  raise exception E'SUPER ADMIN TESTS (rolled back)%', res;
end
$t$;
