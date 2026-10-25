ALTER TABLE `users` ADD `refresh_all` integer DEFAULT false NOT NULL;--> statement-breakpoint
-- The owner, 25 Oct 2026: "pra minha conta lucas.dallacqua@gmail.com deixe sem limites. Pras
-- outras mantenha o limite aceitavel". Every game on that account's shelf is asked about each
-- day; every other account keeps its turn in the daily hundred. Nothing where it is not.
UPDATE `users` SET `refresh_all` = true WHERE lower(`email`) = 'lucas.dallacqua@gmail.com';
