import Link from 'next/link';
import { ArrowDown, ArrowRight, Play, Plus, Smartphone } from 'lucide-react';
import { PublicFooter, PublicHeader } from '@/components/layout/public-layout';
import { QuickLogSuggestion } from '@/features/quick-log/suggestion';
import { EventCard } from '@/features/events/event-card';
import { NightPreview } from './night-preview';
import publicStyles from '@/components/layout/public-pages.module.css';
import styles from './landing.module.css';

const questions = [
  {
    question: 'Do I need an account?',
    answer:
      'Quick Log works without one. Create an account to sync your logs across devices, plan shared nights and revisit your history.',
  },
  {
    question: 'What counts as a chaser?',
    answer:
      'A non-alcoholic follow-up, like water, soda or juice. DWD keeps chasers separate from your drink count.',
  },
  {
    question: 'Where are my logs saved?',
    answer:
      'Guest logs stay in this browser on this device. Clearing browser data can remove them. Signed-in logs sync to your account.',
  },
  {
    question: 'Can DWD tell me if I can drive?',
    answer:
      'No. A drink count cannot determine sobriety or driving safety. Arrange a safe way home; never use DWD to decide whether to drive.',
  },
];

export function LandingPage() {
  return (
    <div className={publicStyles['page']}>
      <PublicHeader />
      <main id="main-content" className={styles['landing']}>
        <section className={styles['hero']} aria-labelledby="landing-heading">
          <div className={styles['heroCopy']}>
            <span className={styles['productType']}>The drink log for your night out</span>
            <h1 id="landing-heading">
              Your night.
              <br />
              <em>Your own </em>
              <br />
              <em>pace.</em>
            </h1>
            <p className={styles['intro']}>
              Keep count of drinks and chasers, plan a night with your mates, and keep the memories.
            </p>
            <div className={styles['heroActions']}>
              <Link className="button button-primary" href="/signup">
                Get started <ArrowRight size={18} aria-hidden="true" />
              </Link>
              <Link className={styles['guestLink']} href="/quick-log?scope=guest">
                Log now <ArrowRight size={17} aria-hidden="true" />
                <span>No account needed</span>
              </Link>
            </div>
            <div className={styles['storeButtons']} aria-label="Mobile apps">
              <button type="button" disabled aria-label="Available soon on the App Store">
                <Smartphone size={23} aria-hidden="true" />
                <span>
                  <small>Available soon on</small>
                  <strong>App Store</strong>
                </span>
              </button>
              <button type="button" disabled aria-label="Available soon on Google Play">
                <Play size={23} aria-hidden="true" />
                <span>
                  <small>Available soon on</small>
                  <strong>Google Play</strong>
                </span>
              </button>
            </div>
            <a className={styles['exploreLink']} href="#how-it-works">
              Take a look around <ArrowDown size={15} aria-hidden="true" />
            </a>
          </div>
          <NightPreview />
        </section>
        <section id="how-it-works" className={styles['howSection']} aria-labelledby="how-heading">
          <div className={styles['sectionIntro']}>
            <span className={styles['sectionNumber']} aria-hidden="true">
              01 / THE PLAN
            </span>
            <h2 id="how-heading">
              A little less admin.
              <br />
              <em>A little more night.</em>
            </h2>
            <Link className={styles['inlineLink']} href="/signup">
              Plan a night <ArrowRight size={17} aria-hidden="true" />
            </Link>
          </div>
          <ol className={styles['steps']}>
            <li>
              <span className={styles['stepNumber']} aria-hidden="true">
                01
              </span>
              <div>
                <h3>Keep your own count.</h3>
                <p>Tap to log a drink or a chaser. Undo a tap whenever you need to.</p>
              </div>
            </li>
            <li>
              <span className={styles['stepNumber']} aria-hidden="true">
                02
              </span>
              <div>
                <h3>Bring your mates.</h3>
                <p>Start a shared night and send an invite. Everyone keeps their own log.</p>
              </div>
            </li>
            <li>
              <span className={styles['stepNumber']} aria-hidden="true">
                03
              </span>
              <div>
                <h3>Keep the memories.</h3>
                <p>Come back to your night’s history and shared photos with an account.</p>
              </div>
            </li>
          </ol>
        </section>
        <section className={styles['eventsSection']} aria-labelledby="landing-events">
          <div className={styles['eventHeading']}>
            <div>
              <span className={styles['sectionNumber']} aria-hidden="true">
                02 / THE CAMERA ROLL
              </span>
              <h2 id="landing-events">
                You had to <em>be there.</em>
              </h2>
            </div>
            <Link className={styles['inlineLink']} href="/events">
              All events <ArrowRight size={18} aria-hidden="true" />
            </Link>
          </div>
          <EventCard />
        </section>
        <section
          id="questions"
          className={styles['questionsSection']}
          aria-labelledby="questions-heading"
        >
          <div className={styles['sectionIntro']}>
            <span className={styles['sectionNumber']} aria-hidden="true">
              03 / BEFORE YOU GO
            </span>
            <h2 id="questions-heading">
              A few
              <br />
              <em>good questions.</em>
            </h2>
            <Link className={styles['inlineLink']} href="/support">
              Get in touch <ArrowRight size={17} aria-hidden="true" />
            </Link>
          </div>
          <div className={styles['questions']}>
            {questions.map(({ question, answer }) => (
              <details key={question}>
                <summary>
                  {question}
                  <Plus size={19} aria-hidden="true" />
                </summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>
        <section className={styles['closing']} aria-labelledby="closing-heading">
          <h2 id="closing-heading">
            Good company.
            <br />
            <em>Your kind of night.</em>
          </h2>
          <Link className="button" href="/signup">
            Create an account <ArrowRight size={18} aria-hidden="true" />
          </Link>
          <span className={styles['closingMark']} aria-hidden="true">
            dwd.
          </span>
        </section>
      </main>
      <PublicFooter />
      <QuickLogSuggestion />
    </div>
  );
}
