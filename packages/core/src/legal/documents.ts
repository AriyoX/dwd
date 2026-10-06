export const LEGAL_CONTACT = { name: 'Ariyo Ahumuza', email: 'ahumuzaariyo@gmail.com' };
export const LEGAL_UPDATED = '6 October 2026';
export interface LegalDocument {
  title: string;
  introduction: string;
  sections: { title: string; paragraphs: string[] }[];
}

export const PRIVACY_POLICY: LegalDocument = {
  title: 'Privacy policy',
  introduction:
    'Drink with Desire (DWD) is operated by Ariyo Ahumuza. This policy covers the DWD website and mobile app. Contact ahumuzaariyo@gmail.com for privacy questions, access requests, corrections or deletion assistance.',
  sections: [
    {
      title: 'Information we use',
      paragraphs: [
        'Accounts include your email, authentication identifiers and sessions, display name, adult/legal-age confirmation and account preferences. Password authentication is handled by Supabase; DWD does not display passwords to operators or other participants. If you choose Google or Apple sign-in, the provider supplies identity information such as an identifier, email and sometimes a name. You may use Apple’s private relay address.',
        'DWD stores the nights you create or join, plans, drink and chaser entries, corrections, invitation metadata, alerts, check-in requests, uploaded photos, feedback and security/audit events. Drink entries can reveal personal habits. Do not put passwords, invitation links or unnecessary sensitive information into names, photos or reports.',
        'Hosting and authentication providers process technical information such as IP addresses and request logs to operate and secure the service. DWD has no advertising or analytics SDKs, does not sell personal data and does not access contacts, call history or the microphone.',
      ],
    },
    {
      title: 'Optional location and permissions',
      paragraphs: [
        'With your operating-system or browser permission, DWD reads foreground device location to choose country-specific emergency numbers and holiday reminders. Coordinates are matched to a bundled country map on your device, are not stored by DWD and are not sent to DWD or a reverse-geocoding service. Only the supported country code and holiday region are saved to your account. Your device timezone is saved for mobile notification timing. DWD does not track location in the background.',
        'If permission is declined, location is unavailable or the country is unsupported, DWD uses Uganda. Help clearly labels the fallback; Uganda’s numbers may not apply where you are. Location and country boundaries are approximate. Verify the displayed country before calling, or dial the local emergency number directly. A call button opens your phone dialler; DWD does not place or record calls itself.',
        'Photo access is optional and used only when you choose photos to upload. Android uses the system photo picker without broad access to your photo library. Notification access is optional. You can revoke permissions in device/browser settings and continue using DWD.',
      ],
    },
    {
      title: 'Why we process information',
      paragraphs: [
        'We use account and night data to provide the service you request, sync shared nights, recover pending actions, and manage account deletion. Optional location and notification access depend on your permission. We use limited operational and audit information to protect accounts, prevent abuse and resolve service problems. Where applicable, these activities rely on providing our service, your consent, legitimate interests in security, or legal obligations. Withdrawing permission does not affect processing that already occurred lawfully.',
      ],
    },
    {
      title: 'Who can see your information',
      paragraphs: [
        'Current account members can see their shared night, participant names, plans, entries and eligible photo memories. Uploaded photos are visible only to their uploader until operator approval; rejected photos are not shared. Blocking a person prevents sharing active nights and hides their photos. People who leave have access to their own finished-night history under the app’s access rules. Email addresses are not shown to participants. Hosts can manage invited guests without accounts; ask for their permission before recording information or uploading a photo of someone.',
        'Anyone holding a valid invitation link can see its night name, host name and times before joining. Treat links as private. Hosts can revoke or replace invitations. Server invitation tokens are stored as hashes.',
        'Supabase provides authentication, database, storage and realtime services. Vercel hosts the website. Expo and the relevant Apple, Google or browser push providers deliver notifications. Google and Apple process sign-in if you choose them. These providers process data needed for their services and may operate outside your country. Authorized operators may access records to handle support, abuse reports and service security. Information may be disclosed when required by law; we do not give advertisers access.',
      ],
    },
    {
      title: 'Device storage and security',
      paragraphs: [
        'Web authentication uses cookies. Mobile authentication tokens are stored in the platform’s encrypted secure storage. Pending entries, unfinished setups, support drafts, cached account/night data and theme/tour preferences may be stored locally so you can continue offline. Those local records are not all encrypted by DWD; use a trusted device and its screen lock.',
        'Signing out normally keeps account-separated pending entries for later recovery. Confirmed account deletion clears that account’s saved app data on the requesting mobile device. Browser records and copies on other devices must be cleared on each device. Clear website data or uninstall the app when retiring a device. Server access uses authenticated access rules and HTTPS. No service can guarantee absolute security.',
      ],
    },
    {
      title: 'Notifications',
      paragraphs: [
        'DWD stores notification preferences, device push registrations, check-in and reminder records, and notification read/open/action status. Night-related lock-screen messages use generic text; open DWD for details. Optional pre-plot messages use planning copy and country-specific calendars before likely going-out windows, with active-night suppression and frequency limits. You can disable pre-plot reminders, pause reminders or turn off this device’s push delivery in the app and revoke permission in device/browser settings.',
        'Signing out removes the current device’s registration when connected. Push delivery can be delayed or fail. Reminders and check-ins do not monitor anyone’s health or contact emergency services.',
      ],
    },
    {
      title: 'Retention and account deletion',
      paragraphs: [
        'We keep account and service records while your account remains open so your history and shared nights remain available. You can remove your photos and request deletion through Account → Delete account in the app or the public deletion page on the website. There is no fee and you do not need to reinstall the app to request deletion on the web.',
        'Deletion is scheduled for 30 days after your request. A fresh sign-in before processing starts cancels the request; refreshing an existing session does not. Once processing begins, cancellation is unavailable. The hourly deletion worker removes uploaded photos, your login/profile, personal plans and entries, support records, private messages, preferences and notifications. Nights you hosted are closed. Other participants’ records remain; a minimal “Deleted user” membership and shared night timeline may remain without your personal entries. Deletion may be retried if a provider is unavailable.',
        'Provider backups and operational/security logs may remain for their configured retention periods and are not used to recreate a deleted account in normal operation. A legally required record may be retained only for that obligation. Contact us for the applicable retention details or assistance with local copies.',
      ],
    },
    {
      title: 'Your choices and rights',
      paragraphs: [
        'You can correct your display name, adjust notification settings, revoke device permissions, remove your uploaded photos and request account deletion. You may also contact ahumuzaariyo@gmail.com to request access, correction, a copy, restriction or objection where your local law provides those rights. Identity verification may be needed to protect your account; do not email your password. A self-service data-export feature is not currently available.',
        'DWD is intended for adults who meet the local legal drinking age and is not intended for children. If a child’s information was submitted, contact us to arrange removal. You may complain to your local privacy regulator, including Uganda’s Personal Data Protection Office. Your mandatory local privacy and consumer rights continue to apply.',
      ],
    },
    {
      title: 'Policy updates',
      paragraphs: [
        'We will update this policy when our practices change and show the updated date. Material changes affecting optional data use will be explained in the app before that use begins.',
      ],
    },
  ],
};

export const TERMS_OF_SERVICE: LegalDocument = {
  title: 'Terms of service',
  introduction:
    'These terms apply to Drink with Desire (DWD), operated by Ariyo Ahumuza. Contact ahumuzaariyo@gmail.com for support or questions. By creating an account or using DWD, you agree to these terms and acknowledge the privacy policy.',
  sections: [
    {
      title: 'Who can use DWD',
      paragraphs: [
        'You must be at least 18 and meet the legal drinking age that applies where you are. Do not use DWD to encourage underage or unlawful drinking. Provide accurate account information, protect your login and use only an account you are authorized to access. Google/Apple sign-in does not replace your legal-age confirmation.',
      ],
    },
    {
      title: 'Purpose and limits',
      paragraphs: [
        'DWD helps you record what you choose to consume, plan a shared night and remember check-ins. It is not a drinking game, competition, medical device, BAC calculator, sobriety detector or driving-safety tool. Recording a plan does not make that amount safe or recommend consuming it. You can stop drinking at any time; never drink to reach a plan or match another person.',
        'Counts, alcohol equivalents and pacing estimates are approximate and depend on what you record. Never use DWD to decide whether anyone can drive, is sober or needs medical care. Arrange safe transport and seek qualified medical help when needed. Notifications, sync, location and emergency-number detection may be unavailable, delayed or inaccurate.',
      ],
    },
    {
      title: 'Emergencies',
      paragraphs: [
        'If someone cannot be awakened, has a seizure, breathes slowly or irregularly, is severely confused, repeatedly vomits or has unusually cold/clammy skin, seek emergency help immediately and stay with them. Do not wait for DWD. Help opens a dialler with numbers for the detected supported country; without location it uses Uganda. Check the displayed country and use your local emergency number if it does not apply. A DWD check-in is not an emergency call.',
      ],
    },
    {
      title: 'Respectful shared use',
      paragraphs: [
        'Ask someone before managing a guest record or sharing their photo. Do not post unlawful, abusive, harassing, discriminatory, threatening, sexually explicit or exploitative content. Do not share someone’s private information without permission, impersonate others, infringe copyright, spam users, promote dangerous consumption or interfere with the service’s security or access controls.',
        'You retain rights to your content. You give DWD permission to store, process and display it only as needed to provide the service and enforce these terms. Share only content you have the right to share. Invitation links are private access links; distribute them carefully and revoke links that are exposed.',
        'Report harmful content or users through support or ahumuzaariyo@gmail.com. Include enough detail to identify the night or photo without sharing passwords or active invitation links. We may remove content or restrict accounts that violate these terms. Reports are not emergency assistance.',
      ],
    },
    {
      title: 'Availability and changes',
      paragraphs: [
        'The current service is offered without a subscription or in-app purchases. An internet connection is needed for server operations; your carrier may charge for data or calls. Offline actions may remain pending until accepted by the server. Keep important records separately.',
        'We may change features, perform maintenance or suspend access for security, abuse or legal reasons. Where practical, we will provide notice of material changes. Do not rely on uninterrupted service or notification delivery for safety.',
      ],
    },
    {
      title: 'Ending use and deletion',
      paragraphs: [
        'You may stop using DWD and request account deletion in Account → Delete account or through the website’s deletion page. Deletion is scheduled after 30 days and a fresh sign-in before processing begins cancels it. The privacy policy and deletion guide describe the records removed and the minimal shared records that remain. Save anything you need before requesting deletion.',
      ],
    },
    {
      title: 'Responsibility and local rights',
      paragraphs: [
        'You are responsible for your decisions, accurate entries, lawful use and the information you share. We take reasonable care to operate DWD, but do not promise that it will prevent injury, intoxication or loss. To the extent permitted by applicable law, we are not responsible for losses caused by inaccurate user entries, third-party outages or use contrary to these terms. Nothing excludes responsibility or limits consumer/privacy rights that cannot lawfully be excluded.',
        'These terms are interpreted under Uganda law, subject to mandatory protections and competent courts available under your local law. Contact us first if you have a concern; this does not prevent exercising a legal right or contacting a regulator.',
      ],
    },
    {
      title: 'Changes to these terms',
      paragraphs: [
        'The updated date identifies the current terms. Material changes will be communicated through the website or app. If you do not agree to revised terms, stop using DWD and request deletion; your mandatory rights remain unaffected.',
      ],
    },
  ],
};
