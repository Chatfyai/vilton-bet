-- 1. Enable Delete for Admins (RLS)
CREATE POLICY "Admins can delete matches" ON "public"."matches" FOR DELETE TO public USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));
CREATE POLICY "Admins can delete bets" ON "public"."bets" FOR DELETE TO public USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

-- 2. Fix Constraints for Deletion (Cascade)
ALTER TABLE public.bets DROP CONSTRAINT IF EXISTS bets_match_id_fkey;
ALTER TABLE public.bets ADD CONSTRAINT bets_match_id_fkey FOREIGN KEY (match_id) REFERENCES public.matches (id) ON DELETE CASCADE;

ALTER TABLE public.bet_selections DROP CONSTRAINT IF EXISTS bet_selections_odd_id_fkey;
ALTER TABLE public.bet_selections ADD CONSTRAINT bet_selections_odd_id_fkey FOREIGN KEY (odd_id) REFERENCES public.odds (id) ON DELETE CASCADE;

-- 3. Fix Signup Trigger (handle_new_user)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  INSERT INTO public.profiles (id, username, balance, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    100.00,
    'user'
  );
  RETURN NEW;
END;
$function$;

-- 4. Hybrid Odds Calculation (Global + Prior H2H)
-- (See full function definition in database for calculate_player_odds)
