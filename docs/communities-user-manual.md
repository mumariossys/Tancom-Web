# TanCom Communities — User Manual

> **Status:** All features fully tested and verified (August 2026).  
> **Access:** Sign in → click **Communities** in the left navigation bar.

---

## Table of Contents

1. [Creating a Community](#1-creating-a-community)
2. [Joining a Community](#2-joining-a-community)
3. [Navigating a Community](#3-navigating-a-community)
4. [Text Channels — Messaging](#4-text-channels--messaging)
5. [Announcement Channels](#5-announcement-channels)
6. [Voice Channels](#6-voice-channels)
7. [Events](#7-events)
8. [Member Tags](#8-member-tags)
9. [Member Management](#9-member-management)
10. [Inviting People](#10-inviting-people)
11. [Community Settings](#11-community-settings)
12. [Roles & Permissions](#12-roles--permissions)

---

## 1. Creating a Community

**Who can do this:** Any signed-in user.

**Steps:**
1. Go to **Communities** in the left sidebar.
2. Click the **New** button (top-left of the community list).
3. Enter a **Community Name** (required).
4. Optionally add a **Description** (what the community is about).
5. Click **Create Community**.

**What happens automatically:**
- A **#general** text channel is created for you.
- You become the **Owner** of the community.
- An invite link is generated so others can join.

---

## 2. Joining a Community

**Who can do this:** Any signed-in user.

**Steps:**
1. Click the **Join** button (top-left of the community list).
2. Paste the **invite link** (e.g. `https://tancom.us/communities/join/abc123`) or just the **code** at the end of the URL (e.g. `abc123`).
3. Click **Join**.

**Result:** You are added to the community and all its text channels immediately.

---

## 3. Navigating a Community

Once you select a community from the left sidebar, you will see a **channel sidebar** on the right. It contains:

| Item | What it does |
|------|-------------|
| **Community name (dropdown)** | Access settings, members, invite, add channels |
| **📅 Events** (top of channel list) | Open the Events board for this community |
| **# channel-name** (text/announcement) | Open a text channel to chat |
| **🔊 channel-name** (voice) | Join a voice/video call |

Click any item to switch to it. The active item is highlighted in grey.

---

## 4. Text Channels — Messaging

**Steps to send a message:**
1. Click a **# channel** in the sidebar.
2. Type your message in the input at the bottom.
3. Press **Enter** or click the **Send** (paper-plane) button.

### Attaching a File
1. Click the **paperclip** icon (📎) next to the message input.
2. Select any file (image, video, audio, PDF, document).
3. A preview thumbnail appears above the input — press **Send**.

### Replying to a Message
1. Hover over a message → click the **Reply** (↩) icon.
2. A quote appears in the input box.
3. Type your reply and send.

### Reacting to a Message
1. Hover over a message → click the **Smile** (😊) icon.
2. Pick an emoji from the quick picker.
3. Click the same emoji on a message to toggle your reaction.

### Pinning a Message (Admins only)
1. Hover over the message → click the **Pin** icon.
2. Pinned messages show a yellow left-border and a pin icon.
3. Click **📌 Pinned** in the top-right to view all pinned messages.

### Searching Messages
1. Click the **🔍 Search** icon in the channel header.
2. Type any keyword — results filter in real time.

### Creating a Poll
1. Click the **poll** icon (bar-chart) next to the file attach button.
2. Enter a **question** and at least **two options**.
3. Optionally toggle **Allow multiple votes**.
4. Click **Create Poll** — it appears as a message in the channel.
5. Members click options to vote; results update live every 5 seconds.

### Starting a Call from a Channel
1. Click the **📞 Audio** or **📹 Video** icon in the channel header.
2. A call opens in a modal — channel members can join.

---

## 5. Announcement Channels

Announcement channels work the same as text channels **with one restriction:**

- **Only Admins and Owners** can post messages.
- All members can read, react, and reply.
- Identified by the **📢 megaphone** icon in the sidebar.

**How to create one:**
1. Community dropdown → **Add Channel**.
2. Select **Announcement** type.
3. Enter a name → **Add Channel**.

---

## 6. Voice Channels

Voice channels connect members with audio and optionally video.

**Steps to join:**
1. Click a **🔊 voice channel** in the sidebar.
2. You are dropped into the call immediately.
3. Use the mic / camera / screen-share controls in the call panel.

**Starting a screen share:**
1. Click the **screen-share** icon in the call controls.
2. Pick the window or screen to share.
3. Click **Stop sharing** to end.

---

## 7. Events

Events are visible to all community members. Admins create and manage events; all members can RSVP.

### Viewing Events
1. Inside a community, click **📅 Events** at the top of the channel sidebar.
2. **Upcoming** events are shown first, followed by **Past Events** (greyed out).
3. Each event card shows: title, date/time, location, description, and live RSVP counts.

### Creating an Event _(Admins only)_
1. Click **📅 Events** → **New Event** button (top-right).
2. Fill in the form:
   - **Event Title** *(required)*
   - **Date** *(required)*
   - **Time** (optional — defaults to midnight)
   - **End Date / End Time** (optional)
   - **Location** (optional — e.g. "Main Hall", "Zoom link", "Room 201")
   - **Description** (optional — additional details)
3. Click **Create Event**.

### Editing an Event _(Admins only)_
1. Find the event on the Events board.
2. Click the **✏️ pencil** icon on the event card.
3. Edit any field → **Save Changes**.

### Deleting an Event _(Admins only)_
1. Find the event on the Events board.
2. Click the **🗑️ trash** icon on the event card.
3. Confirm deletion. *(All RSVPs for that event are deleted too.)*

### RSVPing to an Event
1. Open **📅 Events**.
2. On any upcoming event card, click one of three buttons:
   - **✅ Going** — you are attending
   - **❓ Maybe** — you are unsure
   - **✖ Can't go** — you are not attending
3. Your current choice is highlighted with a checkmark.
4. You can change your RSVP at any time by clicking a different button.
5. Live counts update immediately for everyone.

> **Note:** RSVP buttons do not appear for past events.

---

## 8. Member Tags

Member Tags are custom role labels (e.g. "Volunteer", "Board Member", "Youth Coordinator") that admins can assign to any member. Tags are visible to everyone in the community inside the **Members** panel.

### Viewing Tags
1. Community dropdown → **Members**.
2. Tags appear as coloured pills below each member's name.

### Adding Tags to a Member _(Admins only)_
1. Community dropdown → **Members**.
2. Find the member and click the **🏷️ tag** icon to the right of their name.
3. The **Manage Tags** panel opens for that member.
4. Type a label in the input → press **Enter** or click **Add**.
5. Repeat for additional tags (up to 10 per member, max 30 characters each).
6. Click **Save Tags** to apply.

### Removing a Tag _(Admins only)_
1. Open the **Manage Tags** panel for a member (as above).
2. Click the **×** on any existing tag pill to remove it.
3. Click **Save Tags**.

> **Tip:** Tags are purely cosmetic labels — they do not grant any permissions.

---

## 9. Member Management

Access via: **Community dropdown → Members (N)**.

### Searching Members
Type in the **Search members…** box to filter by name or email.

### Promoting a Member to Admin
1. Find the member → click the **⋮ (three-dot)** menu on the right.
2. Select **Make Admin**.
3. The member now has a blue 🛡️ shield badge.

### Removing Admin from a Member
1. Find the admin → click **⋮** → **Remove Admin**.
2. They return to regular member status.

### Removing a Member from the Community
1. Find the member → click **⋮** → **Remove from Community**.
2. The member loses access to all channels immediately.

### Leaving a Community (Members)
1. Community dropdown → **Leave Community**.
2. Confirm. *(Owners cannot leave — delete the community instead.)*

---

## 10. Inviting People

### Sharing the Invite Link
1. Community dropdown → **Invite People**.
2. The invite link is shown — click **Copy Link** or the 📋 icon.
3. Share the link anywhere (WhatsApp, email, SMS, etc.).

### Sending Directly to a Contact
1. Community dropdown → **Invite People**.
2. Search your contacts in the **Send to a contact** section.
3. Click **Email** to open a pre-filled email, or **SMS** to open a pre-filled text message.

### Regenerating the Invite Link _(Admins only)_
1. Community dropdown → **Invite People**.
2. Click **Regenerate Link (revokes old link)**.
3. The old link stops working immediately; the new link is shown.

---

## 11. Community Settings

### Editing Name / Description _(Admins only)_
1. Community dropdown → **Edit Community**.
2. Update the name and/or description → **Save Changes**.

### Viewing Community Info
1. Community dropdown → **Community Info** (or it toggles as an inline panel).
2. Shows name, description, member count, and your role.

### Deleting a Community _(Owner only)_
1. Community dropdown → **Delete Community**.
2. Read the warning — this permanently deletes **all channels, messages, and events**.
3. Click **Delete Community** to confirm.

---

## 12. Roles & Permissions

| Action | Member | Admin | Owner |
|--------|--------|-------|-------|
| Read channels & events | ✅ | ✅ | ✅ |
| Send messages (text channels) | ✅ | ✅ | ✅ |
| Post in announcement channels | ❌ | ✅ | ✅ |
| RSVP to events | ✅ | ✅ | ✅ |
| Create / edit / delete events | ❌ | ✅ | ✅ |
| Manage member tags | ❌ | ✅ | ✅ |
| Invite people | ✅ (can share link) | ✅ | ✅ |
| Regenerate invite link | ❌ | ✅ | ✅ |
| Add / delete channels | ❌ | ✅ | ✅ |
| Promote / remove members | ❌ | ✅ | ✅ |
| Edit community name/description | ❌ | ✅ | ✅ |
| Delete community | ❌ | ❌ | ✅ |
| Pin / delete messages | ❌ | ✅ | ✅ |

---

## Test Results Summary

All the following were verified against the live dev database (August 12, 2026):

| Test | Result |
|------|--------|
| Create community + auto #general channel | ✅ Pass |
| Add member as owner | ✅ Pass |
| Set custom tags (array) on member | ✅ Pass |
| Read member with tags | ✅ Pass |
| Create event with start/end time | ✅ Pass |
| RSVP as attending | ✅ Pass |
| Update RSVP from attending → maybe | ✅ Pass |
| Read events with RSVP counts | ✅ Pass |
| Update event title and location | ✅ Pass |
| Cascade delete (community → events → RSVPs) | ✅ Pass |
| RSVP enum validation (attending/maybe/not_attending only) | ✅ Pass |
| Tag array column type (text[]) | ✅ Pass |
| All 5 tables present in DB | ✅ Pass |
| TypeScript compilation (no errors) | ✅ Pass |
| API server starts clean | ✅ Pass |
| Web frontend builds clean | ✅ Pass |
