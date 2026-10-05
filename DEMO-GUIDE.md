# Demo accounts for the defense

Six made-up people are on the live site (phil-freela.pages.dev) so every page
has something to show. They were added by `database/demo_data.sql` on
2026-10-05. All six share one password, which is not written in this
repository: it is the one Claude gave in the chat that day.

## Who they are

1. `demo.maria@example.com`, Maria Lopez, client (coffee shop owner). The main
   one to sign in as. 5 finished projects, 4.8 stars from freelancers, replies
   in about 30 minutes, 2 job posts.
2. `demo.juan@example.com`, Juan Dela Cruz, freelancer (video editing).
   Verified. 5 finished, 4 on time, 4.8 stars, replies in about 15 minutes, 2
   services. The strong record.
3. `demo.ana@example.com`, Ana Reyes, freelancer (graphic design). Verified. 3
   finished, 2 on time, 4.0 stars, replies in about 2 hours, 2 services. The
   mixed record.
4. `demo.marco@example.com`, Marco Bautista, freelancer (photography).
   Verified but brand new: no projects, no ratings, no chats, 1 service.
5. `demo.rico@example.com`, Rico Villanueva, freelancer (copywriting). NOT
   verified, so his one service is hidden from everyone else.
6. `demo.sofia@example.com`, Sofia Cruz, client (boutique owner). 3 finished
   projects, 2.7 stars from freelancers, replies about a day later, 1 job post.
   The difficult client.

## A 10-minute path

1. Sign in as **Maria**. Show "Recommended for you" and search for "logo" or
   "promo video" (the first search after a quiet period is slower while the
   AI service wakes up and reads the new posts).
2. Open **Juan's** page from a result: 5 finished, 4 on time, 4.8 stars, his
   reply time, his completed projects with what clients wrote. Open **Ana's**
   to compare (one late delivery, lower stars, slower replies).
3. **Browse Services**: Rico's copywriting service is not there, because he is
   not verified. Marco's is, with no record yet.
4. **Projects**: "Holiday promo video" is waiting for Maria's review. Open it,
   mark it done and rate Juan. This is the live Done and Rating demo, and
   Juan's numbers change right after.
5. **Bookings**: one accepted ("Christmas menu poster", shown as Project:
   Started) and one still pending with Marco.
6. Sign in as **Marco**: the Bookings link shows 1. Accept "Photos of our new
   pastries" and it becomes a project.
7. Sign in as **Juan** or **Ana** and open **Sofia's** client page: 2.7 stars
   and slow replies, which is what a freelancer sees before taking her job.
8. Identity check: sign in as **Rico** to show an unverified freelancer, then
   run the real verification with your own ID and face. (The demo accounts
   were marked verified without ID photos, so the admin Verifications page
   shows them without pictures.)

## Things to know

1. Reply times only count chats from the last 30 days. The demo chats are 3
   to 9 days old on the day the script runs, so after about 3 weeks the reply
   times start to disappear. Before a later defense, remove the demo data and
   add it again (both scripts, in the Supabase SQL Editor) to get fresh dates.
2. Steps 4 and 6 above can each be done once. Removing and adding the demo
   data again resets them.
3. Nobody is emailed: the addresses end in `@example.com`, which never
   receives mail, and "email me when I'm offline" is off for all six.
4. After the defense, run `database/demo_data_remove.sql` in the Supabase SQL
   Editor. It removes the six accounts and everything that belongs to them.
