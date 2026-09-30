-- Shape Up: sending cut cards to the barbershop
-- ------------------------------------------------------------------
-- Run this AFTER the earlier files (SQL Editor -> New query -> paste -> Run).
-- Safe to run again.
--
-- Changes:
--   * a cut card can be linked to one of the customer's bookings (the time and
--     barber are then filled in from the booking)
--   * photos are optional: a customer can send a cut card without sharing a photo,
--     and the database refuses photos unless the customer gave permission
-- ------------------------------------------------------------------

alter table public.cut_cards
  add column if not exists appointment_id uuid references public.appointments (id) on delete set null,
  add column if not exists has_front_photo boolean not null default false;
alter table public.cut_cards alter column photo_consent_at drop not null;
grant insert (appointment_id, has_front_photo) on public.cut_cards to authenticated;

-- Filled in by the database, so the app can't fake them.
create or replace function public.cut_cards_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_appt public.appointments;
begin
  new.status := 'new';
  new.barber_notes := '';
  new.created_at := now();
  new.updated_at := now();
  new.photos_deleted_at := null;
  select p.first_name into new.customer_first_name from public.profiles p where p.id = new.customer_id;

  -- Photos only with permission.
  if new.has_front_photo or new.has_side_photo or new.has_preview then
    if new.photo_consent_at is null then
      raise exception 'Sharing your photo needs your permission first.';
    end if;
    new.photo_consent_at := least(new.photo_consent_at, now());
  else
    new.photo_consent_at := null;
  end if;

  -- Linked to a booking: take the time (and barber, if none was picked) from it.
  if new.appointment_id is not null then
    select * into v_appt from public.appointments a
      where a.id = new.appointment_id and a.customer_id = new.customer_id
        and a.shop_id = new.shop_id and a.status = 'booked';
    if v_appt.id is null then raise exception 'That appointment isn’t available. Pick another one.'; end if;
    new.appointment_at := v_appt.starts_at;
    new.barber_id := coalesce(new.barber_id, v_appt.barber_id);
  end if;

  if new.appointment_at is not null
     and (new.appointment_at < now() - interval '1 day' or new.appointment_at > now() + interval '1 year') then
    raise exception 'Appointment time must be within the next year';
  end if;
  -- Photos are deleted 7 days after the appointment, or 30 days after sending if no appointment.
  new.photos_delete_after := coalesce(new.appointment_at + interval '7 days', now() + interval '30 days');
  return new;
end;
$$;
