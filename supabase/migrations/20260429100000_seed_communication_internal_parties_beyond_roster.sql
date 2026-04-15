-- Seed Beyond roster as communication "internal" parties (Basecamp person id + email + display name).
-- Skips rows that already match an active party by basecamp_id or email (safe to re-run).

insert into public.communication_internal_parties (email, basecamp_id, display_name, note, is_active)
select lower(btrim(v.email)), btrim(v.basecamp_id), btrim(v.display_name), 'Beyond roster (seed)', true
from (
  values
    ('kelly@beyondindigo.com', '3839811', 'Kelly Baltzell'),
    ('elyse@beyondindigo.com', '4573506', 'Elyse Phillips, VP of People & Process'),
    ('alex@beyondindigo.com', '4744581', 'Alex Michel, Digital Marketing Strategist'),
    ('kate@beyondindigo.com', '6962689', 'kate@beyondindigo.com'),
    ('helpdesk@beyondindigohelp.com', '10371750', 'helpdesk@beyondindigohelp.com'),
    ('help@beyondindigo.com', '10371751', 'help@beyondindigo.com'),
    ('chris.maust@beyondindigo.com', '12413572', 'Chris Maust'),
    ('alicia@beyondindigo.com', '13260807', 'Alicia van den Hemel | V.P. of Finance'),
    ('tom@beyondindigo.com', '14439709', 'Tom Kiesel | Marketing Services Director'),
    ('ashley@beyondindigo.com', '14613202', 'Ashley Meeks | Project Manager'),
    ('hannah@beyondindigo.com', '15595837', 'Hannah Bachman | Project Management Director'),
    ('scott.kiefner@beyondindigo.com', '15680269', 'Scott Kiefner'),
    ('beth.frank@beyondindigo.com', '16659591', 'Beth'),
    ('courtney.bailey@beyondindigo.com', '16659592', 'Courtney Bailey'),
    ('tyler@beyondindigo.com', '16956085', 'tyler@beyondindigo.com'),
    ('nate.tuttle@beyondindigo.com', '17196847', 'Nathan Tuttle | Builder'),
    ('beth.demilt@beyondindigo.com', '17436867', 'Beth DeMilt | Content Manager'),
    ('anthony@beyondindigo.com', '18306083', 'Anthony DiGrazio | Marketing Strategist'),
    ('eric@beyondindigo.com', '18345703', 'Eric Hellmann'),
    ('stephanie@beyondindigo.com', '18397616', 'Stephanie Anderson | Marketing Strategist'),
    ('dr.jennifersteiner@beyondthebodypsych.com', '18516759', 'Jennifer Steiner'),
    ('scott@beyondindigo.com', '18524894', 'scott@beyondindigo.com'),
    ('hollis@beyondindigo.com', '18727424', 'hollis@beyondindigo.com'),
    ('daniel@beyondindigo.com', '18822647', 'Daniel Gonzalez'),
    ('jennifer@beyondindigo.com', '18828233', 'Jennifer Cruz'),
    ('nicole@beyondindigo.com', '18832641', 'Nicole Hall | Brand & Key Account Marketing Strategist'),
    ('debra@beyondindigo.com', '18861457', 'Debra Jenkins | Marketing Strategist'),
    ('hannah@beyondindigopets.com', '19006118', 'Hannah'),
    ('melissa@beyondindigo.com', '19165462', 'Melissa Rodriguez')
) as v(email, basecamp_id, display_name)
where not exists (
  select 1
  from public.communication_internal_parties c
  where c.is_active
    and (
      (c.basecamp_id is not null and btrim(c.basecamp_id) = btrim(v.basecamp_id))
      or (
        c.email is not null
        and btrim(c.email) <> ''
        and lower(btrim(c.email)) = lower(btrim(v.email))
      )
    )
);
