begin;

create table private.preplot_markets (
  country_code text primary key check (country_code in ('UG','KE','TZ','RW','ZA','AE','GB','US','CA')),
  name text not null,
  enabled boolean not null default true,
  timezones text[] not null,
  observed text not null check (observed in ('none','sunday','weekend','uk','us')),
  easter boolean not null,
  lunar text not null check (lunar in ('none','eid','eid_mawlid','uae')),
  source_url text not null
);
alter table private.preplot_markets enable row level security;
revoke all on private.preplot_markets from public, anon, authenticated;
grant all on private.preplot_markets to service_role;

alter table private.preplot_holidays add column country_code text not null default 'UG';
alter table private.preplot_holidays add column calendar_region text not null default 'national';
alter table private.preplot_holidays drop constraint preplot_holidays_pkey;
alter table private.preplot_holidays add primary key(country_code,calendar_region,day);
alter table private.preplot_annual_holidays add column country_code text not null default 'UG';
alter table private.preplot_annual_holidays drop constraint preplot_annual_holidays_pkey;
alter table private.preplot_annual_holidays add primary key(country_code,month,day);

-- Snapshot of the shared country registry. A regression test guards against drift.
do $seed$
declare profiles jsonb := $profiles$[
  {
    "code": "UG",
    "name": "Uganda",
    "priority": "africa",
    "timezones": [
      "Africa/Kampala",
      "Africa/Nairobi"
    ],
    "observed": "none",
    "easter": true,
    "lunar": "eid",
    "calendarSource": "https://arusha.mofa.go.ug/basic-page/public-holidays",
    "emergencySource": "https://upf.go.ug/public-safety-crime-response-and-security-operations-update/",
    "emergencyAuthority": "Uganda Police Force",
    "reviewedAt": "2026-10-06",
    "emergency": [
      {
        "number": "112",
        "service": "Emergency"
      },
      {
        "number": "999",
        "service": "Emergency"
      }
    ],
    "holidays": []
  },
  {
    "code": "KE",
    "name": "Kenya",
    "priority": "africa",
    "timezones": [
      "Africa/Nairobi",
      "Africa/Kampala",
      "Africa/Dar_es_Salaam"
    ],
    "observed": "sunday",
    "easter": true,
    "lunar": "eid",
    "calendarSource": "https://new.kenyalaw.org/akn/ke/act/1912/21/eng@2024-04-26/source",
    "emergencySource": "https://nationalpolice.go.ke/sites/default/files/2026-04/NPS%20Handbook_2025.pdf",
    "emergencyAuthority": "National Police Service",
    "reviewedAt": "2026-10-06",
    "emergency": [
      {
        "number": "999",
        "service": "Police emergency"
      },
      {
        "number": "112",
        "service": "Police emergency"
      },
      {
        "number": "911",
        "service": "Police emergency"
      }
    ],
    "holidays": [
      {
        "month": 1,
        "day": 1,
        "campaign": "new_year",
        "mode": "celebrate"
      },
      {
        "month": 5,
        "day": 1,
        "campaign": "labour_day",
        "mode": "celebrate"
      },
      {
        "month": 6,
        "day": 1,
        "campaign": "madaraka",
        "mode": "celebrate"
      },
      {
        "month": 10,
        "day": 10,
        "campaign": "mazingira",
        "mode": "celebrate"
      },
      {
        "month": 10,
        "day": 20,
        "campaign": "mashujaa",
        "mode": "celebrate"
      },
      {
        "month": 12,
        "day": 12,
        "campaign": "jamhuri",
        "mode": "celebrate"
      },
      {
        "month": 12,
        "day": 25,
        "campaign": "christmas",
        "mode": "celebrate"
      },
      {
        "month": 12,
        "day": 26,
        "campaign": "boxing_day",
        "mode": "celebrate"
      }
    ]
  },
  {
    "code": "TZ",
    "name": "Tanzania",
    "priority": "africa",
    "timezones": [
      "Africa/Dar_es_Salaam",
      "Africa/Nairobi",
      "Africa/Kampala"
    ],
    "observed": "none",
    "easter": true,
    "lunar": "eid_mawlid",
    "calendarSource": "https://www.om.tzembassy.go.tz/services/public-holidays-in-tanzania",
    "emergencySource": "https://www.tanzania.go.tz/faqs",
    "emergencyAuthority": "Government of Tanzania",
    "reviewedAt": "2026-10-06",
    "emergency": [
      {
        "number": "112",
        "service": "Police"
      },
      {
        "number": "114",
        "service": "Fire and rescue"
      }
    ],
    "holidays": [
      {
        "month": 1,
        "day": 1,
        "campaign": "new_year",
        "mode": "celebrate"
      },
      {
        "month": 1,
        "day": 12,
        "campaign": "zanzibar_revolution",
        "mode": "celebrate"
      },
      {
        "month": 4,
        "day": 7,
        "campaign": "karume",
        "mode": "suppress"
      },
      {
        "month": 4,
        "day": 26,
        "campaign": "union_day",
        "mode": "celebrate"
      },
      {
        "month": 5,
        "day": 1,
        "campaign": "labour_day",
        "mode": "celebrate"
      },
      {
        "month": 7,
        "day": 7,
        "campaign": "saba_saba",
        "mode": "celebrate"
      },
      {
        "month": 8,
        "day": 8,
        "campaign": "nane_nane",
        "mode": "celebrate"
      },
      {
        "month": 10,
        "day": 14,
        "campaign": "nyerere",
        "mode": "suppress"
      },
      {
        "month": 12,
        "day": 9,
        "campaign": "independence",
        "mode": "celebrate"
      },
      {
        "month": 12,
        "day": 25,
        "campaign": "christmas",
        "mode": "celebrate"
      },
      {
        "month": 12,
        "day": 26,
        "campaign": "boxing_day",
        "mode": "celebrate"
      }
    ]
  },
  {
    "code": "RW",
    "name": "Rwanda",
    "priority": "africa",
    "timezones": [
      "Africa/Kigali",
      "Africa/Maputo"
    ],
    "observed": "weekend",
    "easter": true,
    "lunar": "eid",
    "calendarSource": "https://www.mifotra.gov.rw/fileadmin/user_upload/Mifotra/Publication/4.PRESIDENTIAL_ORDERS/PO_on_Mission__delegations_of_powers_and_public_holidays_2022__1_.pdf",
    "emergencySource": "https://www.gov.rw/emergency",
    "emergencyAuthority": "Government of Rwanda",
    "reviewedAt": "2026-10-06",
    "emergency": [
      {
        "number": "912",
        "service": "Ambulance"
      },
      {
        "number": "112",
        "service": "Emergency"
      }
    ],
    "holidays": [
      {
        "month": 1,
        "day": 1,
        "campaign": "new_year",
        "mode": "celebrate"
      },
      {
        "month": 1,
        "day": 2,
        "campaign": "new_year_second_day",
        "mode": "celebrate"
      },
      {
        "month": 2,
        "day": 1,
        "campaign": "heroes_day",
        "mode": "suppress"
      },
      {
        "month": 5,
        "day": 1,
        "campaign": "labour_day",
        "mode": "celebrate"
      },
      {
        "month": 7,
        "day": 1,
        "campaign": "independence",
        "mode": "celebrate"
      },
      {
        "month": 7,
        "day": 4,
        "campaign": "liberation",
        "mode": "celebrate"
      },
      {
        "month": 8,
        "day": 15,
        "campaign": "assumption",
        "mode": "suppress"
      },
      {
        "month": 12,
        "day": 25,
        "campaign": "christmas",
        "mode": "celebrate"
      },
      {
        "month": 12,
        "day": 26,
        "campaign": "boxing_day",
        "mode": "celebrate"
      }
    ]
  },
  {
    "code": "ZA",
    "name": "South Africa",
    "priority": "africa",
    "timezones": [
      "Africa/Johannesburg"
    ],
    "observed": "sunday",
    "easter": true,
    "lunar": "none",
    "calendarSource": "https://www.gov.za/about-sa/public-holidays",
    "emergencySource": "https://www.sanews.gov.za/south-africa/arrive-alive-road-safety-tips",
    "emergencyAuthority": "South African Government News Agency",
    "reviewedAt": "2026-10-06",
    "emergency": [
      {
        "number": "112",
        "service": "Mobile emergency"
      },
      {
        "number": "10177",
        "service": "Ambulance"
      },
      {
        "number": "10111",
        "service": "Police"
      }
    ],
    "holidays": [
      {
        "month": 1,
        "day": 1,
        "campaign": "new_year",
        "mode": "celebrate"
      },
      {
        "month": 3,
        "day": 21,
        "campaign": "human_rights",
        "mode": "suppress"
      },
      {
        "month": 4,
        "day": 27,
        "campaign": "freedom_day",
        "mode": "celebrate"
      },
      {
        "month": 5,
        "day": 1,
        "campaign": "workers_day",
        "mode": "celebrate"
      },
      {
        "month": 6,
        "day": 16,
        "campaign": "youth_day",
        "mode": "suppress"
      },
      {
        "month": 8,
        "day": 9,
        "campaign": "womens_day",
        "mode": "celebrate"
      },
      {
        "month": 9,
        "day": 24,
        "campaign": "heritage_day",
        "mode": "celebrate"
      },
      {
        "month": 12,
        "day": 16,
        "campaign": "reconciliation",
        "mode": "suppress"
      },
      {
        "month": 12,
        "day": 25,
        "campaign": "christmas",
        "mode": "celebrate"
      },
      {
        "month": 12,
        "day": 26,
        "campaign": "goodwill",
        "mode": "celebrate"
      }
    ]
  },
  {
    "code": "AE",
    "name": "Dubai / UAE",
    "priority": "international",
    "timezones": [
      "Asia/Dubai"
    ],
    "observed": "none",
    "easter": false,
    "lunar": "uae",
    "calendarSource": "https://u.ae/en/information-and-services/public-holidays-and-religious-affairs/public-holidays",
    "emergencySource": "https://u.ae/en/information-and-services/justice-safety-and-the-law/handling-emergencies",
    "emergencyAuthority": "Government of the UAE",
    "reviewedAt": "2026-10-06",
    "emergency": [
      {
        "number": "998",
        "service": "Ambulance"
      },
      {
        "number": "999",
        "service": "Police"
      },
      {
        "number": "997",
        "service": "Fire"
      }
    ],
    "holidays": [
      {
        "month": 1,
        "day": 1,
        "campaign": "new_year",
        "mode": "celebrate"
      },
      {
        "month": 11,
        "day": 30,
        "campaign": "commemoration",
        "mode": "suppress"
      },
      {
        "month": 12,
        "day": 2,
        "campaign": "national_day",
        "mode": "celebrate"
      },
      {
        "month": 12,
        "day": 3,
        "campaign": "national_day_second_day",
        "mode": "celebrate"
      }
    ]
  },
  {
    "code": "GB",
    "name": "United Kingdom",
    "priority": "international",
    "timezones": [
      "Europe/London",
      "Europe/Belfast",
      "GB",
      "GB-Eire"
    ],
    "observed": "uk",
    "easter": true,
    "lunar": "none",
    "calendarSource": "https://www.gov.uk/bank-holidays",
    "emergencySource": "https://www.gov.uk/guidance/999-and-112-the-uks-national-emergency-numbers",
    "emergencyAuthority": "UK Government",
    "reviewedAt": "2026-10-06",
    "emergency": [
      {
        "number": "999",
        "service": "Emergency"
      },
      {
        "number": "112",
        "service": "Emergency"
      }
    ],
    "holidays": [
      {
        "month": 1,
        "day": 1,
        "campaign": "new_year",
        "mode": "celebrate"
      },
      {
        "month": 12,
        "day": 25,
        "campaign": "christmas",
        "mode": "celebrate"
      },
      {
        "month": 12,
        "day": 26,
        "campaign": "boxing_day",
        "mode": "celebrate"
      }
    ]
  },
  {
    "code": "US",
    "name": "United States",
    "priority": "international",
    "timezones": [
      "America/New_York",
      "America/Detroit",
      "America/Kentucky/Louisville",
      "America/Kentucky/Monticello",
      "America/Indiana/Indianapolis",
      "America/Indiana/Vincennes",
      "America/Indiana/Winamac",
      "America/Indiana/Marengo",
      "America/Indiana/Petersburg",
      "America/Indiana/Vevay",
      "America/Chicago",
      "America/Indiana/Tell_City",
      "America/Indiana/Knox",
      "America/Menominee",
      "America/North_Dakota/Center",
      "America/North_Dakota/New_Salem",
      "America/North_Dakota/Beulah",
      "America/Denver",
      "America/Boise",
      "America/Phoenix",
      "America/Los_Angeles",
      "America/Anchorage",
      "America/Juneau",
      "America/Sitka",
      "America/Metlakatla",
      "America/Yakutat",
      "America/Nome",
      "America/Adak",
      "Pacific/Honolulu",
      "US/Eastern",
      "US/Central",
      "US/Mountain",
      "US/Pacific",
      "US/Alaska",
      "US/Aleutian",
      "US/Arizona",
      "US/Hawaii",
      "US/Indiana-Starke",
      "US/Michigan",
      "US/East-Indiana",
      "America/Indianapolis",
      "America/Louisville",
      "America/Knox_IN",
      "America/Fort_Wayne",
      "America/Shiprock",
      "America/Atka",
      "Pacific/Johnston"
    ],
    "observed": "us",
    "easter": false,
    "lunar": "none",
    "calendarSource": "https://www.opm.gov/policy-data-oversight/pay-leave/federal-holidays/",
    "emergencySource": "https://www.911.gov/calling-911/",
    "emergencyAuthority": "National 911 Program",
    "reviewedAt": "2026-10-06",
    "emergency": [
      {
        "number": "911",
        "service": "Emergency"
      }
    ],
    "holidays": [
      {
        "month": 1,
        "day": 1,
        "campaign": "new_year",
        "mode": "celebrate"
      },
      {
        "month": 6,
        "day": 19,
        "campaign": "juneteenth",
        "mode": "suppress"
      },
      {
        "month": 7,
        "day": 4,
        "campaign": "independence",
        "mode": "celebrate"
      },
      {
        "month": 11,
        "day": 11,
        "campaign": "veterans",
        "mode": "suppress"
      },
      {
        "month": 12,
        "day": 25,
        "campaign": "christmas",
        "mode": "celebrate"
      }
    ]
  },
  {
    "code": "CA",
    "name": "Canada",
    "priority": "international",
    "timezones": [
      "America/St_Johns",
      "America/Halifax",
      "America/Glace_Bay",
      "America/Moncton",
      "America/Goose_Bay",
      "America/Blanc-Sablon",
      "America/Toronto",
      "America/Iqaluit",
      "America/Atikokan",
      "America/Winnipeg",
      "America/Resolute",
      "America/Rankin_Inlet",
      "America/Regina",
      "America/Swift_Current",
      "America/Edmonton",
      "America/Cambridge_Bay",
      "America/Inuvik",
      "America/Creston",
      "America/Dawson_Creek",
      "America/Fort_Nelson",
      "America/Whitehorse",
      "America/Dawson",
      "America/Vancouver",
      "America/Montreal",
      "America/Thunder_Bay",
      "America/Nipigon",
      "America/Rainy_River",
      "America/Pangnirtung",
      "America/Yellowknife",
      "Canada/Atlantic",
      "Canada/Central",
      "Canada/Eastern",
      "Canada/Mountain",
      "Canada/Newfoundland",
      "Canada/Pacific",
      "Canada/Saskatchewan",
      "Canada/Yukon",
      "America/Coral_Harbour"
    ],
    "observed": "none",
    "easter": true,
    "lunar": "none",
    "calendarSource": "https://www.canada.ca/en/services/jobs/workplace/federal-labour-standards/vacations-holidays.html",
    "emergencySource": "https://web.crtc.gc.ca/eng/phone/911/",
    "emergencyAuthority": "CRTC",
    "reviewedAt": "2026-10-06",
    "emergency": [
      {
        "number": "911",
        "service": "Emergency"
      }
    ],
    "holidays": [
      {
        "month": 1,
        "day": 1,
        "campaign": "new_year",
        "mode": "celebrate"
      },
      {
        "month": 7,
        "day": 1,
        "campaign": "canada_day",
        "mode": "celebrate"
      },
      {
        "month": 9,
        "day": 30,
        "campaign": "truth_reconciliation",
        "mode": "suppress"
      },
      {
        "month": 11,
        "day": 11,
        "campaign": "remembrance",
        "mode": "suppress"
      },
      {
        "month": 12,
        "day": 25,
        "campaign": "christmas",
        "mode": "celebrate"
      },
      {
        "month": 12,
        "day": 26,
        "campaign": "boxing_day",
        "mode": "celebrate"
      }
    ]
  }
]$profiles$::jsonb;
begin
  insert into private.preplot_markets(country_code,name,timezones,observed,easter,lunar,source_url)
  select p->>'code',p->>'name',array(select jsonb_array_elements_text(p->'timezones')),p->>'observed',(p->>'easter')::boolean,p->>'lunar',p->>'calendarSource' from jsonb_array_elements(profiles) p;
  insert into private.preplot_annual_holidays(country_code,month,day,campaign,mode,title,body,source_url)
  select p->>'code',(h->>'month')::integer,(h->>'day')::integer,h->>'campaign',h->>'mode','Holiday plans?','Heading out? Start your DWD Night before you leave.',p->>'calendarSource'
  from jsonb_array_elements(profiles) p cross join lateral jsonb_array_elements(p->'holidays') h;
end $seed$;

alter table private.preplot_holidays add foreign key(country_code) references private.preplot_markets(country_code);
alter table private.preplot_holidays add check ((country_code='GB' and calendar_region in ('national','england-and-wales','scotland','northern-ireland')) or (country_code<>'GB' and calendar_region='national'));
alter table private.preplot_annual_holidays add foreign key(country_code) references private.preplot_markets(country_code);
alter table private.preplot_preferences add column country_code text not null default 'UG' references private.preplot_markets(country_code);
alter table private.preplot_preferences add column calendar_region text not null default 'national';
alter table private.preplot_preferences add column country_selected boolean not null default false;
-- Preserve the Uganda launch preference for existing accounts. New accounts
-- must choose a campaign country explicitly before any pre-plot push qualifies.
insert into private.preplot_preferences(user_id,country_selected) select id,true from public.profiles
  on conflict(user_id) do update set country_selected=true;
alter table private.preplot_preferences add constraint preplot_preferences_region_check check ((country_code='GB' and calendar_region in ('england-and-wales','scotland','northern-ireland')) or (country_code<>'GB' and calendar_region='national'));
create index preplot_preferences_country_idx on private.preplot_preferences(country_code);
alter table private.preplot_campaigns add column country_code text not null default 'UG' references private.preplot_markets(country_code);
alter table private.preplot_campaigns add column calendar_region text not null default 'national';
alter table private.preplot_campaigns add column timezone text not null default 'Africa/Kampala';
create index preplot_campaigns_country_idx on private.preplot_campaigns(country_code);

create function private.preplot_nth_weekday(p_year integer,p_month integer,p_weekday integer,p_nth integer)
returns date language sql immutable strict security invoker set search_path = '' as $$
  select case when p_nth=-1 then (make_date(p_year,p_month,1)+interval '1 month -1 day')::date
    - ((extract(isodow from make_date(p_year,p_month,1)+interval '1 month -1 day')::integer-p_weekday+7)%7)
  else make_date(p_year,p_month,1)+((p_weekday-extract(isodow from make_date(p_year,p_month,1))::integer+7)%7)+7*(p_nth-1) end;
$$;

create function private.preplot_holiday_row(p_day date,p_country text,p_region text,p_campaign text,p_mode text,p_source text)
returns private.preplot_holidays language sql immutable security invoker set search_path = '' as $$
  select row(p_day,p_campaign,p_mode,'Holiday plans?','Heading out? Start your DWD Night before you leave.',p_source,p_country,p_region)::private.preplot_holidays;
$$;

create function private.preplot_holiday_for(p_day date,p_country text,p_region text)
returns private.preplot_holidays language plpgsql stable strict security invoker set search_path = '' as $$
declare h private.preplot_holidays; m private.preplot_markets; r record;
  y integer := extract(year from p_day)::integer; hy integer; iy integer; d date; o date; official date; e date;
begin
  select * into m from private.preplot_markets where country_code=p_country;
  if not found then return null; end if;
  if p_country='RW' and to_char(p_day,'MM-DD') between '04-07' and '04-13' then
    return private.preplot_holiday_row(p_day,p_country,p_region,'kwibuka','suppress',
      'https://www.rlrc.gov.rw/fileadmin/user_upload/RLRC/Laws_of_Rwanda_v2/Domestic_laws/Laws_in_force/7._Administrative/7.6._Heritage_and_tradition/7.6.3._Genocide_remembrance/7.6.3.2._Commemoration_of__the_Genocide_against_the_Tuts_MO_16-MOJ-19-_of_2019.pdf');
  end if;
  select * into h from private.preplot_holidays where day=p_day and country_code=p_country
    and calendar_region in ('national',p_region) order by (calendar_region=p_region) desc limit 1;
  if found then return h; end if;

  if m.lunar<>'none' then
    hy:=30*(p_day-date '0622-07-18')/10631+1;
    for iy in greatest(hy-1,1)..hy+1 loop
      if m.lunar='uae' and p_day between private.preplot_civil_hijri_date(iy,9,1)-2 and private.preplot_civil_hijri_date(iy,10,1)+4 then
        return private.preplot_holiday_row(p_day,p_country,p_region,'ramadan','suppress',m.source_url);
      end if;
      for r in select * from (values ('eid_al_fitr',10,1),('eid_al_adha',12,10),('mawlid',3,12),('islamic_new_year',1,1)) as a(campaign,month,day)
        where campaign in ('eid_al_fitr','eid_al_adha') or (campaign='mawlid' and m.lunar in ('eid_mawlid','uae'))
          or (campaign='islamic_new_year' and m.lunar='uae')
      loop
        d:=private.preplot_civil_hijri_date(iy,r.month,r.day);
        select day into official from private.preplot_holidays where country_code=p_country
          and campaign=r.campaign and day between d-7 and d+7 order by abs(day-d) limit 1;
        if official is not null then
          if p_day between official and official+(case when m.lunar='uae' and r.campaign in ('eid_al_fitr','eid_al_adha') then 2 else 0 end) then
            return private.preplot_holiday_row(p_day,p_country,p_region,r.campaign,'suppress',m.source_url);
          end if;
        elsif p_day between d-(case when m.lunar='uae' and r.campaign='eid_al_adha' then 3 else 2 end)
          and d+(case when m.lunar='uae' then 4 else 2 end) then
          return private.preplot_holiday_row(p_day,p_country,p_region,r.campaign||'_estimate','suppress',m.source_url);
        end if;
      end loop;
    end loop;
  end if;

  -- Actual fixed dates retain priority over automatically observed dates.
  select p_day,campaign,mode,title,body,source_url,country_code,p_region into h from private.preplot_annual_holidays
    where country_code=p_country and month=extract(month from p_day) and day=extract(day from p_day);
  if found then h.day:=p_day; return h; end if;

  for iy in y-1..y+1 loop
    for r in select * from private.preplot_annual_holidays where country_code=p_country loop
      d:=make_date(iy,r.month,r.day); o:=d;
      if m.observed='sunday' and extract(isodow from d)=7 then o:=d+1;
      elsif m.observed in ('weekend','uk') and extract(isodow from d)>5 then
        o:=d+8-extract(isodow from d)::integer;
        if m.observed='uk' and r.campaign='boxing_day' and extract(isodow from d)=7 then o:=d+2; end if;
        if m.observed='uk' and r.campaign='christmas' and extract(isodow from d)=7 then o:=d+2; end if;
        if m.observed='uk' and p_region='scotland' and r.campaign='new_year' and extract(isodow from d)=7 then o:=d+2; end if;
      elsif m.observed='us' then
        if extract(isodow from d)=6 then o:=d-1; elsif extract(isodow from d)=7 then o:=d+1; end if;
      end if;
      if o<>d and p_day=o then return private.preplot_holiday_row(p_day,p_country,p_region,r.campaign||'_observed',r.mode,m.source_url); end if;
    end loop;
  end loop;
  e:=private.preplot_gregorian_easter(y);
  if m.easter and p_day in (e-2,e) then
    return private.preplot_holiday_row(p_day,p_country,p_region,case when p_day=e then 'easter_sunday' else 'good_friday' end,'suppress',m.source_url);
  elsif m.easter and p_day=e+1 and p_country<>'CA' and not (p_country='GB' and p_region='scotland') then
    return private.preplot_holiday_row(p_day,p_country,p_region,case when p_country='ZA' then 'family_day' else 'easter_monday' end,'celebrate',m.source_url);
  end if;
  if p_country='RW' and p_day=private.preplot_nth_weekday(y,8,5,1) then
    return private.preplot_holiday_row(p_day,p_country,p_region,'umuganura','celebrate',m.source_url);
  end if;
  if p_country='GB' then
    d:=null;
    if p_day=private.preplot_nth_weekday(y,5,1,1) then d:=p_day; r:=row('early_may'::text,'celebrate'::text);
    elsif p_day=private.preplot_nth_weekday(y,5,1,-1) then d:=p_day; r:=row('spring_bank'::text,'celebrate'::text);
    elsif p_day=private.preplot_nth_weekday(y,8,1,case when p_region='scotland' then 1 else -1 end) then d:=p_day; r:=row('summer_bank'::text,'celebrate'::text);
    elsif p_region='scotland' and (to_char(p_day,'MM-DD')='01-02' or (extract(isodow from make_date(y,1,2))>5 and p_day=make_date(y,1,4))) then d:=p_day; r:=row('new_year_second_day'::text,'celebrate'::text);
    elsif p_region='scotland' and (to_char(p_day,'MM-DD')='11-30' or (extract(isodow from make_date(y,11,30))>5 and p_day=make_date(y,11,30)+8-extract(isodow from make_date(y,11,30))::integer)) then d:=p_day; r:=row('st_andrew'::text,'suppress'::text);
    elsif p_region='northern-ireland' and (to_char(p_day,'MM-DD')='03-17' or (extract(isodow from make_date(y,3,17))>5 and p_day=make_date(y,3,17)+8-extract(isodow from make_date(y,3,17))::integer)) then d:=p_day; r:=row('st_patrick'::text,'suppress'::text);
    elsif p_region='northern-ireland' and (to_char(p_day,'MM-DD')='07-12' or (extract(isodow from make_date(y,7,12))>5 and p_day=make_date(y,7,12)+8-extract(isodow from make_date(y,7,12))::integer)) then d:=p_day; r:=row('battle_boyne'::text,'suppress'::text);
    end if;
    if d=p_day then return private.preplot_holiday_row(p_day,p_country,p_region,r.f1,r.f2,m.source_url); end if;
  elsif p_country='US' then
    for r in select * from (values (1,1,3,'mlk','suppress'),(2,1,3,'washington','celebrate'),(5,1,-1,'memorial','suppress'),(9,1,1,'labour_day','celebrate'),(10,1,2,'october_observance','suppress'),(11,4,4,'thanksgiving','celebrate')) as a(month,dow,nth,campaign,mode) loop
      if p_day=private.preplot_nth_weekday(y,r.month,r.dow,r.nth) then return private.preplot_holiday_row(p_day,p_country,p_region,r.campaign,r.mode,m.source_url); end if;
    end loop;
  elsif p_country='CA' then
    if p_day=make_date(y,5,24)-((extract(isodow from make_date(y,5,24))::integer+6)%7) then
      return private.preplot_holiday_row(p_day,p_country,p_region,'victoria_day','celebrate',m.source_url);
    elsif p_day=private.preplot_nth_weekday(y,9,1,1) then return private.preplot_holiday_row(p_day,p_country,p_region,'labour_day','celebrate',m.source_url);
    elsif p_day=private.preplot_nth_weekday(y,10,1,2) then return private.preplot_holiday_row(p_day,p_country,p_region,'thanksgiving','celebrate',m.source_url);
    end if;
  end if;
  return null;
end $$;

create or replace function private.preplot_holiday_for(p_day date)
returns private.preplot_holidays language sql stable strict security invoker set search_path = '' as $$
  select private.preplot_holiday_for(p_day,'UG','national');
$$;
alter function private.preplot_windows(date) rename to preplot_uganda_windows;
create function private.preplot_windows(p_day date,p_country text,p_region text)
returns table(campaign text,send_time time,end_time time,backup boolean,titles text[],bodies text[])
language plpgsql stable strict security invoker set search_path = '' as $$
declare h private.preplot_holidays; eve private.preplot_holidays;
begin
  if not exists(select 1 from private.preplot_markets where country_code=p_country and enabled) then return; end if;
  if p_country='UG' then return query select * from private.preplot_uganda_windows(p_day); return; end if;
  h:=private.preplot_holiday_for(p_day,p_country,p_region);
  eve:=private.preplot_holiday_for(p_day+1,p_country,p_region);
  if h.mode='suppress' or eve.mode='suppress' then return; end if;
  if to_char(p_day,'MM-DD')='12-31' then
    return query select 'nye_preplot','15:00'::time,'16:00'::time,false,array['Before the countdown'],array['Going out tonight? Set your DWD Night before you leave.'];
    return query select 'nye_backup','19:00'::time,'19:30'::time,true,array['Ready for tonight?'],array['Start your Night and set your reminders before heading out.'];
  elsif h.day is not null then
    return query select h.campaign||'_holiday','15:00'::time,'16:00'::time,false,array[h.title],array[h.body];
  elsif eve.day is not null then
    return query select eve.campaign||'_eve','17:15'::time,'18:00'::time,false,array['Holiday tomorrow?'],array['Got evening plans? Start your DWD Night before you head out.'];
  elsif extract(isodow from p_day)=5 then
    return query select 'friday_preplot','17:15'::time,'17:30'::time,false,
      array[case when p_country in ('KE','TZ') then 'What''s the plot? 👀' else 'Weekend plans? 👀' end,'Clocked out?'],
      array['Heading out tonight? Set up your DWD Night before you leave.','Start your Night and set your reminders before heading out.'];
    return query select 'friday_backup','19:30'::time,'19:45'::time,true,array['Before you leave'],array['Going out? Start your Night and make a plan first.'];
  elsif extract(isodow from p_day)=6 then
    return query select 'saturday_preplot','15:30'::time,'16:00'::time,false,array['Plans for tonight?','Have fun. Keep track.'],array['If tonight includes a night out, set up DWD before you go.','Start a Night, set your reminders, and remember to drink water.'];
    return query select 'saturday_backup','19:15'::time,'19:30'::time,true,array['Keys. Wallet. Phone. DWD.'],array['Heading out? Set your Night before you leave.'];
  elsif extract(isodow from p_day)=7 then
    return query select 'sunday_preplot','16:00'::time,'17:00'::time,false,array['Sunday plans?'],array['Going somewhere this evening? Start your DWD Night before you head out.'];
  end if;
end $$;
create function private.preplot_windows(p_day date)
returns table(campaign text,send_time time,end_time time,backup boolean,titles text[],bodies text[])
language sql stable security invoker set search_path = '' as $$ select * from private.preplot_windows(p_day,'UG','national'); $$;

-- Country is account-selected. Timezone comes from the most recently active,
-- signed-in native installation; no IP, locale, or offset is used to infer country.
create function private.preplot_context(p_user_id uuid)
returns table(country_code text,calendar_region text,timezone text)
language sql stable strict security invoker set search_path = '' as $$
  select coalesce(p.country_code,'UG'),coalesce(p.calendar_region,'national'),s.timezone
  from (select timezone from public.native_push_subscriptions s where user_id=p_user_id and disabled_at is null
    and exists(select 1 from auth.sessions a where a.id=s.session_id and a.user_id=s.user_id)
    order by updated_at desc,id limit 1) s
  left join private.preplot_preferences p on p.user_id=p_user_id
  join private.preplot_markets m on m.country_code=p.country_code and p.country_selected and m.enabled and s.timezone=any(m.timezones);
$$;

create or replace function private.preplot_user_eligible(p_user_id uuid,p_now timestamptz)
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists(select 1 from private.preplot_context(p_user_id) c
    left join private.preplot_preferences p on p.user_id=p_user_id
    where coalesce(p.enabled,true)
    and not exists(select 1 from public.account_deletions where user_id=p_user_id)
    and not exists(select 1 from public.notification_preferences where user_id=p_user_id and reminders_muted_until>p_now)
    and not exists(select 1 from public.night_members n join public.nights t on t.id=n.night_id
      where n.user_id=p_user_id and ((n.left_at is null and t.status='active') or greatest(t.starts_at,n.joined_at) between p_now-interval '12 hours' and p_now))
    and not case when coalesce(p.quiet_start,'22:00')=coalesce(p.quiet_end,'08:00') then true
      when coalesce(p.quiet_start,'22:00')<coalesce(p.quiet_end,'08:00') then
        (p_now at time zone c.timezone)::time>=coalesce(p.quiet_start,'22:00') and (p_now at time zone c.timezone)::time<coalesce(p.quiet_end,'08:00')
      else (p_now at time zone c.timezone)::time>=coalesce(p.quiet_start,'22:00') or (p_now at time zone c.timezone)::time<coalesce(p.quiet_end,'08:00') end);
$$;

create or replace function private.create_due_preplot_events(p_now timestamptz default clock_timestamp())
returns integer language plpgsql security invoker set search_path = '' as $$
declare u record; w record; d date; week_start timestamptz; week_end timestamptz; local_now timestamp;
  event_id uuid; choice integer; created integer:=0;
begin
  if not pg_try_advisory_xact_lock(61006072232) then return 0; end if;
  for u in select distinct s.user_id,c.country_code,c.calendar_region,c.timezone from public.native_push_subscriptions s
    cross join lateral private.preplot_context(s.user_id) c where s.disabled_at is null and private.preplot_user_eligible(s.user_id,p_now)
  loop
    local_now:=p_now at time zone u.timezone; d:=local_now::date;
    week_start:=(d-((extract(isodow from d)::integer+2)%7))::timestamp at time zone u.timezone;
    week_end:=((d-((extract(isodow from d)::integer+2)%7))+7)::timestamp at time zone u.timezone;
    for w in select * from private.preplot_windows(d,u.country_code,u.calendar_region)
      where local_now::time>=send_time and local_now::time<end_time
    loop
      if w.campaign='sunday_preplot' and not coalesce((select sunday_enabled from private.preplot_preferences where user_id=u.user_id),false) then continue; end if;
      if exists(select 1 from private.preplot_campaigns where user_id=u.user_id and local_day=d and campaign=w.campaign)
        or (select count(*) from private.preplot_campaigns where user_id=u.user_id and starts_at>=week_start and starts_at<week_end)>=2
        -- A rolling guard also prevents country/timezone changes from resetting caps.
        or (select count(*) from private.preplot_campaigns where user_id=u.user_id and starts_at>p_now-interval '7 days' and starts_at<=p_now)>=2
        or exists(select 1 from private.preplot_campaigns c join public.notification_events e on e.id=c.event_id
          where c.user_id=u.user_id and c.starts_at>=least(week_start,p_now-interval '7 days') and c.starts_at<=p_now
            and (c.opened_at is not null or c.night_started_at is not null or e.acknowledged_at is not null))
        or exists(select 1 from private.preplot_campaigns where user_id=u.user_id and starts_at>p_now-interval '2 hours' and starts_at<=p_now)
        then continue; end if;
      if w.backup and not exists(select 1 from private.preplot_campaigns where user_id=u.user_id and local_day=d
        and country_code=u.country_code and calendar_region=u.calendar_region and timezone=u.timezone and campaign not like '%_backup'
        and accepted_at is not null and opened_at is null and suppressed_at is null) then continue; end if;
      event_id:=extensions.gen_random_uuid();
      choice:=1+abs(hashtextextended(u.user_id::text||d::text||w.campaign,0)%cardinality(w.titles))::integer;
      insert into public.notification_events(id,event_key,recipient_user_id,category,event_type,title,body,deep_link,created_at,expires_at)
      values(event_id,'preplot:'||d||':'||w.campaign,u.user_id,'preplot','preplot',w.titles[choice],w.bodies[choice],
        '/night/new?source=push&campaign='||w.campaign||'&notificationId='||event_id,p_now,(d+w.end_time) at time zone u.timezone);
      insert into private.preplot_campaigns(event_id,user_id,campaign,local_day,starts_at,expires_at,country_code,calendar_region,timezone)
      values(event_id,u.user_id,w.campaign,d,(d+w.send_time) at time zone u.timezone,(d+w.end_time) at time zone u.timezone,u.country_code,u.calendar_region,u.timezone);
      created:=created+1;
    end loop;
  end loop;
  return created;
end $$;

create function private.invalidate_preplot_context(p_user_id uuid)
returns void language sql security invoker set search_path = '' as $$
  update private.preplot_campaigns set suppressed_at=coalesce(suppressed_at,clock_timestamp()) where user_id=p_user_id and expires_at>clock_timestamp();
  update public.native_notification_deliveries d set status='discarded' from private.preplot_campaigns c
    where d.event_id=c.event_id and c.user_id=p_user_id and c.suppressed_at is not null and d.status in ('queued','failed','sending');
$$;
create or replace function public.get_preplot_preferences()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare p private.preplot_preferences;
begin
  if auth.uid() is null then raise exception 'Authentication required.' using errcode='42501'; end if;
  select * into p from private.preplot_preferences where user_id=auth.uid();
  return jsonb_build_object('enabled',coalesce(p.enabled,true),'sundayEnabled',coalesce(p.sunday_enabled,false),
    'countryCode',coalesce(p.country_code,'UG'),'calendarRegion',coalesce(p.calendar_region,'national'),'countrySelected',coalesce(p.country_selected,false));
end $$;

create function public.update_preplot_country(p_country_code text,p_calendar_region text default 'national')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid:=auth.uid(); previous jsonb;
begin
  if actor is null then raise exception 'Authentication required.' using errcode='42501'; end if;
  if not exists(select 1 from private.preplot_markets where country_code=p_country_code)
    or not coalesce((p_country_code='GB' and p_calendar_region in ('england-and-wales','scotland','northern-ireland'))
      or (p_country_code<>'GB' and p_calendar_region='national'),false) then
    raise exception 'Choose a supported country and calendar.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(61006072232);
  previous:=public.get_preplot_preferences();
  insert into private.preplot_preferences(user_id,country_code,calendar_region,country_selected) values(actor,p_country_code,p_calendar_region,true)
    on conflict(user_id) do update set country_code=excluded.country_code,calendar_region=excluded.calendar_region,country_selected=true;
  if previous->>'countryCode'<>p_country_code or previous->>'calendarRegion'<>p_calendar_region then
    perform private.invalidate_preplot_context(actor);
  end if;
  return public.get_preplot_preferences();
end $$;

create or replace function public.update_native_push_context(p_installation_id uuid,p_timezone text)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid:=auth.uid(); v_session uuid:=(auth.jwt()->>'session_id')::uuid; old_timezone text;
begin
  if actor is null or not exists(select 1 from auth.sessions where id=v_session and user_id=actor) then
    raise exception 'Active sign-in required.' using errcode='42501'; end if;
  if not exists(select 1 from pg_catalog.pg_timezone_names where name=p_timezone) then
    raise exception 'Invalid timezone.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(61006072232);
  -- Compare account context, including foreground return on another installation.
  select c.timezone into old_timezone from private.preplot_context(actor) c;
  update public.native_push_subscriptions s set timezone=p_timezone,updated_at=clock_timestamp()
    where installation_id=p_installation_id and user_id=actor and s.session_id=v_session and disabled_at is null;
  if not found then raise exception 'Device not found.' using errcode='42501'; end if;
  if old_timezone is distinct from p_timezone then perform private.invalidate_preplot_context(actor); end if;
  insert into private.preplot_app_sessions(user_id,installation_id,bucket,timezone)
    values(actor,p_installation_id,date_bin(interval '15 minutes',clock_timestamp(),'2026-01-01'::timestamptz),p_timezone) on conflict do nothing;
end $$;

create or replace function private.native_notification_current(p_event public.notification_events,p_subscription public.native_push_subscriptions)
returns boolean language sql stable security definer set search_path = '' as $$
  select case when p_event.event_type<>'preplot' then private.native_notification_current_before_preplot(p_event,p_subscription)
  else p_event.recipient_user_id=p_subscription.user_id and p_event.expires_at>clock_timestamp()
    and p_event.acknowledged_at is null and p_subscription.disabled_at is null
    and exists(select 1 from auth.sessions where id=p_subscription.session_id and user_id=p_subscription.user_id)
    and private.preplot_user_eligible(p_event.recipient_user_id,clock_timestamp())
    and exists(select 1 from private.preplot_campaigns c join private.preplot_context(c.user_id) ctx
      on ctx.country_code=c.country_code and ctx.calendar_region=c.calendar_region and ctx.timezone=c.timezone
      where c.event_id=p_event.id and c.suppressed_at is null and c.opened_at is null and c.starts_at<=clock_timestamp()
      and p_subscription.timezone=c.timezone
      and (c.campaign<>'sunday_preplot' or coalesce((select sunday_enabled from private.preplot_preferences where user_id=c.user_id),false))
      and not exists(select 1 from private.preplot_campaigns earlier join public.notification_events e on e.id=earlier.event_id
        where earlier.user_id=c.user_id and earlier.event_id<>c.event_id and earlier.starts_at>=c.starts_at-interval '7 days'
          and earlier.starts_at<=c.starts_at and (earlier.opened_at is not null or earlier.night_started_at is not null or e.acknowledged_at is not null))) end;
$$;

revoke all on function private.preplot_nth_weekday(integer,integer,integer,integer),
  private.preplot_holiday_row(date,text,text,text,text,text),private.preplot_holiday_for(date,text,text),
  private.preplot_windows(date,text,text),private.preplot_windows(date),private.preplot_uganda_windows(date),
  private.preplot_context(uuid),private.invalidate_preplot_context(uuid) from public,anon,authenticated;
revoke all on function public.update_preplot_country(text,text) from public,anon;
grant execute on function public.update_preplot_country(text,text) to authenticated;

-- Official GOV.UK dated overrides retrieved 6 October 2026; recurrence handles later years.
insert into private.preplot_holidays(day,campaign,mode,title,body,source_url,country_code,calendar_region) values
('2026-01-01','new_year','celebrate','Holiday plans?','Heading out? Start your DWD Night before you leave.','https://www.gov.uk/bank-holidays.json','GB','england-and-wales'),
('2026-04-03','good_friday','suppress','Holiday plans?','Heading out? Start your DWD Night before you leave.','https://www.gov.uk/bank-holidays.json','GB','england-and-wales'),
('2026-04-06','easter_monday','celebrate','Holiday plans?','Heading out? Start your DWD Night before you leave.','https://www.gov.uk/bank-holidays.json','GB','england-and-wales'),
('2026-05-04','bank_holiday','celebrate','Holiday plans?','Heading out? Start your DWD Night before you leave.','https://www.gov.uk/bank-holidays.json','GB','england-and-wales'),
('2026-05-25','bank_holiday','celebrate','Holiday plans?','Heading out? Start your DWD Night before you leave.','https://www.gov.uk/bank-holidays.json','GB','england-and-wales'),
('2026-08-31','bank_holiday','celebrate','Holiday plans?','Heading out? Start your DWD Night before you leave.','https://www.gov.uk/bank-holidays.json','GB','england-and-wales'),
('2026-12-25','christmas','celebrate','Holiday plans?','Heading out? Start your DWD Night before you leave.','https://www.gov.uk/bank-holidays.json','GB','england-and-wales'),
('2026-12-28','boxing_day','celebrate','Holiday plans?','Heading out? Start your DWD Night before you leave.','https://www.gov.uk/bank-holidays.json','GB','england-and-wales'),
('2027-01-01','new_year','celebrate','Holiday plans?','Heading out? Start your DWD Night before you leave.','https://www.gov.uk/bank-holidays.json','GB','england-and-wales'),
('2027-03-26','good_friday','suppress','Holiday plans?','Heading out? Start your DWD Night before you leave.','https://www.gov.uk/bank-holidays.json','GB','england-and-wales'),
('2027-03-29','easter_monday','celebrate','Holiday plans?','Heading out? Start your DWD Night before you leave.','https://www.gov.uk/bank-holidays.json','GB','england-and-wales'),
('2027-05-03','bank_holiday','celebrate','Holiday plans?','Heading out? Start your DWD Night before you leave.','https://www.gov.uk/bank-holidays.json','GB','england-and-wales'),
('2027-05-31','bank_holiday','celebrate','Holiday plans?','Heading out? Start your DWD Night before you leave.','https://www.gov.uk/bank-holidays.json','GB','england-and-wales'),
('2027-08-30','bank_holiday','celebrate','Holiday plans?','Heading out? Start your DWD Night before you leave.','https://www.gov.uk/bank-holidays.json','GB','england-and-wales'),
('2027-12-27','christmas','celebrate','Holiday plans?','Heading out? Start your DWD Night before you leave.','https://www.gov.uk/bank-holidays.json','GB','england-and-wales'),
('2027-12-28','boxing_day','celebrate','Holiday plans?','Heading out? Start your DWD Night before you leave.','https://www.gov.uk/bank-holidays.json','GB','england-and-wales'),
('2028-01-03','new_year','celebrate','Holiday plans?','Heading out? Start your DWD Night before you leave.','https://www.gov.uk/bank-holidays.json','GB','england-and-wales'),
('2028-04-14','good_friday','suppress','Holiday plans?','Heading out? Start your DWD Night before you leave.','https://www.gov.uk/bank-holidays.json','GB','england-and-wales'),
('2028-04-17','easter_monday','celebrate','Holiday plans?','Heading out? Start your DWD Night before you leave.','https://www.gov.uk/bank-holidays.json','GB','england-and-wales'),
('2028-05-01','bank_holiday','celebrate','Holiday plans?','Heading out? Start your DWD Night before you leave.','https://www.gov.uk/bank-holidays.json','GB','england-and-wales'),
('2028-05-29','bank_holiday','celebrate','Holiday plans?','Heading out? Start your DWD Night before you leave.','https://www.gov.uk/bank-holidays.json','GB','england-and-wales'),
('2028-08-28','bank_holiday','celebrate','Holiday plans?','Heading out? Start your DWD Night before you leave.','https://www.gov.uk/bank-holidays.json','GB','england-and-wales'),
('2028-12-25','christmas','celebrate','Holiday plans?','Heading out? Start your DWD Night before you leave.','https://www.gov.uk/bank-holidays.json','GB','england-and-wales'),
('2028-12-26','boxing_day','celebrate','Holiday plans?','Heading out? Start your DWD Night before you leave.','https://www.gov.uk/bank-holidays.json','GB','england-and-wales'),
('2026-01-01','new_year','celebrate','Holiday plans?','Heading out? Start your DWD Night before you leave.','https://www.gov.uk/bank-holidays.json','GB','scotland'),
('2026-01-02','new_year_second_day','celebrate','Holiday plans?','Heading out? Start your DWD Night before you leave.','https://www.gov.uk/bank-holidays.json','GB','scotland'),
('2026-04-03','good_friday','suppress','Holiday plans?','Heading out? Start your DWD Night before you leave.','https://www.gov.uk/bank-holidays.json','GB','scotland'),
('2026-05-04','bank_holiday','celebrate','Holiday plans?','Heading out? Start your DWD Night before you leave.','https://www.gov.uk/bank-holidays.json','GB','scotland'),
('2026-05-25','bank_holiday','celebrate','Holiday plans?','Heading out? Start your DWD Night before you leave.','https://www.gov.uk/bank-holidays.json','GB','scotland'),
('2026-06-15','bank_holiday','celebrate','Holiday plans?','Heading out? Start your DWD Night before you leave.','https://www.gov.uk/bank-holidays.json','GB','scotland'),
('2026-08-03','bank_holiday','celebrate','Holiday plans?','Heading out? Start your DWD Night before you leave.','https://www.gov.uk/bank-holidays.json','GB','scotland'),
('2026-11-30','st_andrew','suppress','Holiday plans?','Heading out? Start your DWD Night before you leave.','https://www.gov.uk/bank-holidays.json','GB','scotland'),
('2026-12-25','christmas','celebrate','Holiday plans?','Heading out? Start your DWD Night before you leave.','https://www.gov.uk/bank-holidays.json','GB','scotland'),
('2026-12-28','boxing_day','celebrate','Holiday plans?','Heading out? Start your DWD Night before you leave.','https://www.gov.uk/bank-holidays.json','GB','scotland'),
('2027-01-01','new_year','celebrate','Holiday plans?','Heading out? Start your DWD Night before you leave.','https://www.gov.uk/bank-holidays.json','GB','scotland'),
('2027-01-04','new_year_second_day','celebrate','Holiday plans?','Heading out? Start your DWD Night before you leave.','https://www.gov.uk/bank-holidays.json','GB','scotland'),
('2027-03-26','good_friday','suppress','Holiday plans?','Heading out? Start your DWD Night before you leave.','https://www.gov.uk/bank-holidays.json','GB','scotland'),
('2027-05-03','bank_holiday','celebrate','Holiday plans?','Heading out? Start your DWD Night before you leave.','https://www.gov.uk/bank-holidays.json','GB','scotland'),
('2027-05-31','bank_holiday','celebrate','Holiday plans?','Heading out? Start your DWD Night before you leave.','https://www.gov.uk/bank-holidays.json','GB','scotland'),
('2027-08-02','bank_holiday','celebrate','Holiday plans?','Heading out? Start your DWD Night before you leave.','https://www.gov.uk/bank-holidays.json','GB','scotland'),
('2027-11-30','st_andrew','suppress','Holiday plans?','Heading out? Start your DWD Night before you leave.','https://www.gov.uk/bank-holidays.json','GB','scotland'),
('2027-12-27','christmas','celebrate','Holiday plans?','Heading out? Start your DWD Night before you leave.','https://www.gov.uk/bank-holidays.json','GB','scotland'),
('2027-12-28','boxing_day','celebrate','Holiday plans?','Heading out? Start your DWD Night before you leave.','https://www.gov.uk/bank-holidays.json','GB','scotland'),
('2028-01-03','new_year','celebrate','Holiday plans?','Heading out? Start your DWD Night before you leave.','https://www.gov.uk/bank-holidays.json','GB','scotland'),
('2028-01-04','new_year_second_day','celebrate','Holiday plans?','Heading out? Start your DWD Night before you leave.','https://www.gov.uk/bank-holidays.json','GB','scotland'),
('2028-04-14','good_friday','suppress','Holiday plans?','Heading out? Start your DWD Night before you leave.','https://www.gov.uk/bank-holidays.json','GB','scotland'),
('2028-05-01','bank_holiday','celebrate','Holiday plans?','Heading out? Start your DWD Night before you leave.','https://www.gov.uk/bank-holidays.json','GB','scotland'),
('2028-05-29','bank_holiday','celebrate','Holiday plans?','Heading out? Start your DWD Night before you leave.','https://www.gov.uk/bank-holidays.json','GB','scotland'),
('2028-08-07','bank_holiday','celebrate','Holiday plans?','Heading out? Start your DWD Night before you leave.','https://www.gov.uk/bank-holidays.json','GB','scotland'),
('2028-11-30','st_andrew','suppress','Holiday plans?','Heading out? Start your DWD Night before you leave.','https://www.gov.uk/bank-holidays.json','GB','scotland'),
('2028-12-25','christmas','celebrate','Holiday plans?','Heading out? Start your DWD Night before you leave.','https://www.gov.uk/bank-holidays.json','GB','scotland'),
('2028-12-26','boxing_day','celebrate','Holiday plans?','Heading out? Start your DWD Night before you leave.','https://www.gov.uk/bank-holidays.json','GB','scotland'),
('2026-01-01','new_year','celebrate','Holiday plans?','Heading out? Start your DWD Night before you leave.','https://www.gov.uk/bank-holidays.json','GB','northern-ireland'),
('2026-03-17','st_patrick','suppress','Holiday plans?','Heading out? Start your DWD Night before you leave.','https://www.gov.uk/bank-holidays.json','GB','northern-ireland'),
('2026-04-03','good_friday','suppress','Holiday plans?','Heading out? Start your DWD Night before you leave.','https://www.gov.uk/bank-holidays.json','GB','northern-ireland'),
('2026-04-06','easter_monday','celebrate','Holiday plans?','Heading out? Start your DWD Night before you leave.','https://www.gov.uk/bank-holidays.json','GB','northern-ireland'),
('2026-05-04','bank_holiday','celebrate','Holiday plans?','Heading out? Start your DWD Night before you leave.','https://www.gov.uk/bank-holidays.json','GB','northern-ireland'),
('2026-05-25','bank_holiday','celebrate','Holiday plans?','Heading out? Start your DWD Night before you leave.','https://www.gov.uk/bank-holidays.json','GB','northern-ireland'),
('2026-07-13','battle_boyne','suppress','Holiday plans?','Heading out? Start your DWD Night before you leave.','https://www.gov.uk/bank-holidays.json','GB','northern-ireland'),
('2026-08-31','bank_holiday','celebrate','Holiday plans?','Heading out? Start your DWD Night before you leave.','https://www.gov.uk/bank-holidays.json','GB','northern-ireland'),
('2026-12-25','christmas','celebrate','Holiday plans?','Heading out? Start your DWD Night before you leave.','https://www.gov.uk/bank-holidays.json','GB','northern-ireland'),
('2026-12-28','boxing_day','celebrate','Holiday plans?','Heading out? Start your DWD Night before you leave.','https://www.gov.uk/bank-holidays.json','GB','northern-ireland'),
('2027-01-01','new_year','celebrate','Holiday plans?','Heading out? Start your DWD Night before you leave.','https://www.gov.uk/bank-holidays.json','GB','northern-ireland'),
('2027-03-17','st_patrick','suppress','Holiday plans?','Heading out? Start your DWD Night before you leave.','https://www.gov.uk/bank-holidays.json','GB','northern-ireland'),
('2027-03-26','good_friday','suppress','Holiday plans?','Heading out? Start your DWD Night before you leave.','https://www.gov.uk/bank-holidays.json','GB','northern-ireland'),
('2027-03-29','easter_monday','celebrate','Holiday plans?','Heading out? Start your DWD Night before you leave.','https://www.gov.uk/bank-holidays.json','GB','northern-ireland'),
('2027-05-03','bank_holiday','celebrate','Holiday plans?','Heading out? Start your DWD Night before you leave.','https://www.gov.uk/bank-holidays.json','GB','northern-ireland'),
('2027-05-31','bank_holiday','celebrate','Holiday plans?','Heading out? Start your DWD Night before you leave.','https://www.gov.uk/bank-holidays.json','GB','northern-ireland'),
('2027-07-12','battle_boyne','suppress','Holiday plans?','Heading out? Start your DWD Night before you leave.','https://www.gov.uk/bank-holidays.json','GB','northern-ireland'),
('2027-08-30','bank_holiday','celebrate','Holiday plans?','Heading out? Start your DWD Night before you leave.','https://www.gov.uk/bank-holidays.json','GB','northern-ireland'),
('2027-12-27','christmas','celebrate','Holiday plans?','Heading out? Start your DWD Night before you leave.','https://www.gov.uk/bank-holidays.json','GB','northern-ireland'),
('2027-12-28','boxing_day','celebrate','Holiday plans?','Heading out? Start your DWD Night before you leave.','https://www.gov.uk/bank-holidays.json','GB','northern-ireland'),
('2028-01-03','new_year','celebrate','Holiday plans?','Heading out? Start your DWD Night before you leave.','https://www.gov.uk/bank-holidays.json','GB','northern-ireland'),
('2028-03-17','st_patrick','suppress','Holiday plans?','Heading out? Start your DWD Night before you leave.','https://www.gov.uk/bank-holidays.json','GB','northern-ireland'),
('2028-04-14','good_friday','suppress','Holiday plans?','Heading out? Start your DWD Night before you leave.','https://www.gov.uk/bank-holidays.json','GB','northern-ireland'),
('2028-04-17','easter_monday','celebrate','Holiday plans?','Heading out? Start your DWD Night before you leave.','https://www.gov.uk/bank-holidays.json','GB','northern-ireland'),
('2028-05-01','bank_holiday','celebrate','Holiday plans?','Heading out? Start your DWD Night before you leave.','https://www.gov.uk/bank-holidays.json','GB','northern-ireland'),
('2028-05-29','bank_holiday','celebrate','Holiday plans?','Heading out? Start your DWD Night before you leave.','https://www.gov.uk/bank-holidays.json','GB','northern-ireland'),
('2028-07-12','battle_boyne','suppress','Holiday plans?','Heading out? Start your DWD Night before you leave.','https://www.gov.uk/bank-holidays.json','GB','northern-ireland'),
('2028-08-28','bank_holiday','celebrate','Holiday plans?','Heading out? Start your DWD Night before you leave.','https://www.gov.uk/bank-holidays.json','GB','northern-ireland'),
('2028-12-25','christmas','celebrate','Holiday plans?','Heading out? Start your DWD Night before you leave.','https://www.gov.uk/bank-holidays.json','GB','northern-ireland'),
('2028-12-26','boxing_day','celebrate','Holiday plans?','Heading out? Start your DWD Night before you leave.','https://www.gov.uk/bank-holidays.json','GB','northern-ireland');

-- One-off national observance; never infer future election dates.
insert into private.preplot_holidays(day,campaign,mode,title,body,source_url,country_code) values ('2026-11-04','election','suppress','','','https://www.gov.za/documents/notices/public-holidays-act-declaration-fourth-day-november-2026-public-holiday','ZA');

commit;
