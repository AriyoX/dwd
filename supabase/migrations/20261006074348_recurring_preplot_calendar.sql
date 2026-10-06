begin;

-- Dated rows remain official/operator overrides. Recurring rules prevent the
-- calendar from disabling weekend campaigns at the end of a reviewed year.
create table private.preplot_annual_holidays (
  month integer not null check (month between 1 and 12),
  day integer not null check (day between 1 and 31),
  campaign text not null check (campaign ~ '^[a-z_]+$'),
  mode text not null check (mode in ('celebrate', 'suppress')),
  title text not null,
  body text not null,
  source_url text not null,
  primary key(month, day)
);
alter table private.preplot_annual_holidays enable row level security;
revoke all on private.preplot_annual_holidays from public, anon, authenticated;
grant all on private.preplot_annual_holidays to service_role;
insert into private.preplot_annual_holidays
select extract(month from day)::integer, extract(day from day)::integer, campaign, mode, title, body, source_url
from private.preplot_holidays where extract(year from day) = 2026 and campaign in
  ('new_year', 'liberation', 'janani_luwum', 'womens_day', 'labour_day', 'martyrs_day', 'heroes_day', 'independence', 'christmas', 'boxing_day');

create function private.preplot_gregorian_easter(p_year integer)
returns date language plpgsql immutable strict security invoker set search_path = '' as $$
declare v_century integer; v_cycle integer; v_correction integer; v_moon integer;
  v_weekday integer; v_offset integer; v_month integer; v_day integer;
begin
  if p_year < 1583 then raise exception 'Gregorian calendar required.' using errcode = '22023'; end if;
  -- Oudin's Gregorian computus, published by the US Naval Observatory:
  -- https://aa.usno.navy.mil/faq/easter (integer arithmetic throughout).
  v_century := p_year / 100;
  v_cycle := p_year % 19;
  v_correction := (v_century - 17) / 25;
  v_moon := (v_century - v_century / 4 - (v_century - v_correction) / 3 + 19 * v_cycle + 15) % 30;
  v_moon := v_moon - (v_moon / 28) * (1 - (v_moon / 28) * (29 / (v_moon + 1)) * ((21 - v_cycle) / 11));
  v_weekday := (p_year + p_year / 4 + v_moon + 2 - v_century + v_century / 4) % 7;
  v_offset := v_moon - v_weekday;
  v_month := 3 + (v_offset + 40) / 44;
  v_day := v_offset + 28 - 31 * (v_month / 4);
  return make_date(p_year, v_month, v_day);
end $$;

create function private.preplot_civil_hijri_date(p_year integer, p_month integer, p_day integer)
returns date language sql immutable strict security invoker set search_path = '' as $$
  -- Tabular lunar forecast, compatible with .NET HijriCalendar adjustment zero.
  -- This is a suppression estimate, never an official holiday declaration.
  select date '0622-07-18' + (354 * (p_year - 1) + (3 + 11 * p_year) / 30
    + ceil(29.5 * (p_month - 1))::integer + p_day - 1);
$$;

create function private.preplot_holiday_for(p_day date)
returns private.preplot_holidays language plpgsql stable strict security invoker set search_path = '' as $$
declare v_holiday private.preplot_holidays; v_easter date; v_hijri_year integer;
  v_year integer; v_eid record; v_estimate date; v_official date;
begin
  -- Exact dates, including one-off/substitute holidays, always take priority.
  select * into v_holiday from private.preplot_holidays where day = p_day;
  if found then return v_holiday; end if;

  -- When no official Eid date exists, suppress around a civil-calendar estimate
  -- rather than guessing a celebration date or disabling the entire year's pushes.
  -- ±2 days reflects lunar/calendar variation; the windows resolver also skips eve.
  v_hijri_year := 30 * (p_day - date '0622-07-18') / 10631 + 1;
  for v_year in greatest(v_hijri_year - 1, 1)..v_hijri_year + 1 loop
    for v_eid in select * from (values ('eid_al_fitr',10,1), ('eid_al_adha',12,10)) as d(campaign,month,day) loop
      v_estimate := private.preplot_civil_hijri_date(v_year, v_eid.month, v_eid.day);
      select day into v_official from private.preplot_holidays
        where campaign = v_eid.campaign and day between v_estimate - 7 and v_estimate + 7
        order by abs(day - v_estimate) limit 1;
      if v_official is not null then
        if p_day = v_official then
          select * into v_holiday from private.preplot_holidays where day = v_official;
          return v_holiday;
        end if;
      elsif p_day between v_estimate - 2 and v_estimate + 2 then
        return row(p_day, v_eid.campaign || '_estimate', 'suppress', '', '',
          'https://learn.microsoft.com/en-us/dotnet/api/system.globalization.hijricalendar.hijriadjustment')::private.preplot_holidays;
      end if;
    end loop;
  end loop;

  select p_day, campaign, mode, title, body, source_url into v_holiday
    from private.preplot_annual_holidays where month = extract(month from p_day) and day = extract(day from p_day);
  if found then return v_holiday; end if;
  v_easter := private.preplot_gregorian_easter(extract(year from p_day)::integer);
  if p_day = v_easter - 2 then
    return row(p_day, 'good_friday', 'suppress', '', '', 'https://aa.usno.navy.mil/faq/easter')::private.preplot_holidays;
  elsif p_day = v_easter then
    return row(p_day, 'easter_sunday', 'suppress', '', '', 'https://aa.usno.navy.mil/faq/easter')::private.preplot_holidays;
  elsif p_day = v_easter + 1 then
    return row(p_day, 'easter_monday', 'celebrate', 'Holiday plans? 👀',
      'Going somewhere this evening? Start a DWD Night before you head out.', 'https://aa.usno.navy.mil/faq/easter')::private.preplot_holidays;
  end if;
  return null;
end $$;

revoke all on function private.preplot_gregorian_easter(integer), private.preplot_civil_hijri_date(integer,integer,integer),
  private.preplot_holiday_for(date) from public, anon, authenticated;

create or replace function private.preplot_windows(p_day date)
returns table(campaign text, send_time time, end_time time, backup boolean, titles text[], bodies text[])
language plpgsql stable security invoker set search_path = '' as $$
declare v_holiday private.preplot_holidays; v_eve private.preplot_holidays;
begin
  select * into v_holiday from private.preplot_holiday_for(p_day);
  select * into v_eve from private.preplot_holiday_for(p_day + 1);
  if v_holiday.mode = 'suppress' or v_eve.mode = 'suppress' then return; end if;
  if to_char(p_day, 'MM-DD') = '12-31' then
    return query select 'nye_preplot', '15:00'::time, '16:00'::time, false,
      array['Tonight is NOT the night to freestyle 😭'], array['Set your Night, pace and reminders before the countdown starts.'];
    return query select 'nye_backup', '19:00'::time, '19:30'::time, true,
      array['See you on the other side 🥂'], array['Going out tonight? Give future-you one favour: start your DWD Night first.'];
  elsif v_holiday.day is not null then
    return query select v_holiday.campaign || '_holiday', '15:00'::time, '16:00'::time, false,
      case when v_holiday.campaign = 'independence' then array[v_holiday.title,
        'Uganda at ' || (extract(year from p_day)::integer - 1962) || ' 🇺🇬🥳'] else array[v_holiday.title] end,
      case when v_holiday.campaign = 'independence' then array[v_holiday.body,
        'If today''s celebrations include a night out, make the plan before the vibes.'] else array[v_holiday.body] end;
  elsif v_eve.day is not null then
    return query select v_eve.campaign || '_eve', '17:15'::time, '18:00'::time, false,
      array[case v_eve.campaign when 'independence' then 'Long weekend loading 🇺🇬'
        when 'christmas' then 'Christmas plot loading 🎄' else 'Holiday tomorrow 👀' end],
      array['Got plans tomorrow? Set up your DWD Night before the plot begins.'];
  elsif extract(isodow from p_day) = 5 then
    return query select 'friday_preplot', '17:15'::time, '17:30'::time, false,
      array['What''s the plot? 👀', 'Ofuluma leero? 👀', 'Clocked out? 🍸'],
      array['Friday is looking suspiciously active. Starting a night? Set it up on DWD first.',
        'If there''s a plot tonight, DWD wants to know before the first drink does.',
        'Work is done. If the night is just getting started, make a plan first.'];
    return query select 'friday_backup', '19:30'::time, '19:45'::time, true,
      array['Kampala is waking up 👀', 'Don''t freestyle the night 😭'],
      array['Going out tonight? Start your DWD night before things get hectic.', 'Set your drinks, pace and reminders before you head out.'];
  elsif extract(isodow from p_day) = 6 then
    return query select 'saturday_preplot', '15:30'::time, '16:00'::time, false,
      array['So… what''s happening tonight?', 'Plot loading… 🍻', 'Tuli wa leero? 👀', 'Have fun. Keep track. 🤝'],
      array['If the group chat has started moving, this is your sign to set up DWD.',
        'Start your Night now. Future-you may appreciate the planning.',
        'Wherever the plot takes you, set up your night before you go.', 'Set a Night, pace yourself, and nywa amazzi agamala too.'];
    return query select 'saturday_backup', '19:15'::time, '19:30'::time, true,
      array['Before you leave 👀', 'Keys. Wallet. Phone. DWD.'],
      array['Two minutes now saves you trying to remember everything later. Start your Night.',
        'Heading out? Set your night before you disappear into the plot.'];
  elsif extract(isodow from p_day) = 7 then
    return query select 'sunday_preplot', '16:00'::time, '17:00'::time, false,
      array['Sunday plot? 👀', 'One last plot?'],
      array['If today unexpectedly became an outside day, we''ve got you.',
        'Going somewhere this evening? Start a DWD Night before you head out.'];
  end if;
end $$;

commit;
