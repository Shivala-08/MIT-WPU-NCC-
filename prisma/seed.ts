import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // Create default admin - password from env, refuse weak passwords
  const adminEmail = process.env.SEED_ADMIN_EMAIL || "admin@ncc-mitwpu.edu.in";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;

  if (!adminPassword || adminPassword.length < 12) {
    throw new Error("SEED_ADMIN_PASSWORD must be set and at least 12 characters");
  }

  const hashedPassword = await bcrypt.hash(adminPassword, 12);
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      name: "NCC Admin",
      email: adminEmail,
      password: hashedPassword,
      role: "ADMIN",
    },
  });
  console.log("✅ Admin user created:", admin.email);

  // Create sample cadet only if explicitly enabled
  if (process.env.SEED_CREATE_CADET === "true") {
    const cadetEmail = process.env.SEED_CADET_EMAIL || "cadet@mitwpu.edu.in";
    const cadetPassword = process.env.SEED_CADET_PASSWORD;

    if (!cadetPassword || cadetPassword.length < 12) {
      throw new Error("SEED_CADET_PASSWORD must be set and at least 12 characters");
    }

    const cadetPasswordHash = await bcrypt.hash(cadetPassword, 12);
    const cadet = await prisma.user.upsert({
      where: { email: cadetEmail },
      update: {},
      create: {
        name: "Sample Cadet",
        email: cadetEmail,
        password: cadetPasswordHash,
        role: "CADET",
        cadetProfile: {
          create: {
            fullName: "Sample Cadet",
            wing: "Army",
            division: "SD",
            year: "2nd Year",
            branch: "Computer Science",
            prn: "PRN001234",
            dob: new Date("2004-05-15"),
            bloodGroup: "O+",
            gender: "Male",
            phone: "9876543210",
            address: "MIT WPU Campus, Pune",
            status: "APPROVED",
          },
        },
      },
    });
    console.log("✅ Sample cadet created:", cadet.email);
  }

  // Create events
  const trekEvent = await prisma.event.upsert({
    where: { slug: "trek-to-korigad-fort" },
    update: {},
    create: {
      title: "Trek to Korigad Fort",
      slug: "trek-to-korigad-fort",
      date: new Date("2026-10-03"),
      status: "COMPLETED",
      category: "Adventure Training",
      description:
        "An exhilarating trek to Korigad Fort in the Sahyadri range near Lonavala, Pune district, fostering adventure training, teamwork, and leadership among NCC cadets.",
      content: JSON.stringify({
        overview:
          "The MIT WPU NCC Unit organised a memorable trek to Korigad Fort on 3rd October 2026. Korigad, also known as Koraigad, is a majestic hill fort perched in the Sahyadri mountain range near Lonavala in Pune district. Rising to an elevation of approximately 929 metres, this fort offered cadets a challenging yet rewarding adventure training experience amidst the lush greenery and scenic vistas of the Western Ghats.",
        aboutFort:
          "Korigad Fort, situated in the Sahyadri range near Lonavala, Pune district, is a historically significant hill fort dating back to the Maratha era. The fort stands at an elevation of about 929 metres and is surrounded by dense vegetation, natural water cisterns, and the remains of ancient fortifications. The trek route passes through winding forest trails, rocky patches, and offers breathtaking panoramic views of the surrounding valleys and lakes, including Aamby Valley.",
        objectives: [
          "Adventure Training – Building physical endurance and mental resilience through challenging terrain",
          "Teamwork – Strengthening bonds between cadets through mutual support on difficult trail sections",
          "Endurance – Testing and improving physical stamina through a demanding uphill trek",
          "Leadership – Providing opportunities for senior cadets to lead groups and make field decisions",
          "Environmental Awareness – Educating cadets about the Western Ghats ecosystem, conservation, and responsible trekking",
        ],
        schedule: [
          { time: "05:30 AM", activity: "Assembly at MIT WPU campus and roll call" },
          { time: "06:00 AM", activity: "Departure by bus to Korigad base village (Peth Shahpur)" },
          { time: "08:00 AM", activity: "Arrival at base village, warm-up exercises and safety briefing" },
          { time: "08:30 AM", activity: "Trek commenced – ascent to Korigad Fort" },
          { time: "10:30 AM", activity: "Reached the summit – fort exploration and historical briefing" },
          { time: "11:30 AM", activity: "Group activities, team-building exercises at the fort top" },
          { time: "12:30 PM", activity: "Packed lunch break with panoramic views" },
          { time: "01:30 PM", activity: "Descent commenced" },
          { time: "03:00 PM", activity: "Reached base village – refreshments and debrief" },
          { time: "03:30 PM", activity: "Departure from base village" },
          { time: "05:30 PM", activity: "Arrival back at MIT WPU campus" },
        ],
        cadetsParticipated: 45,
        keyLearnings: [
          "Cadets demonstrated exceptional teamwork by assisting each other on steep and slippery sections of the trail",
          "Senior cadets effectively led their assigned groups, making tactical decisions about pace and rest stops",
          "The trek reinforced the importance of physical fitness in NCC training",
          "Cadets gained practical knowledge about map reading and navigation in mountain terrain",
          "Environmental awareness was heightened as cadets observed the biodiversity of the Sahyadri range",
          "The experience built camaraderie and strengthened the sense of 'Unity and Discipline' among all participants",
        ],
      }),
    },
  });
  console.log("✅ Trek event created:", trekEvent.title);

  const bloodEvent = await prisma.event.upsert({
    where: { slug: "blood-donation-camp" },
    update: {},
    create: {
      title: "Blood Donation Camp",
      slug: "blood-donation-camp",
      date: new Date("2026-10-09"),
      status: "COMPLETED",
      category: "Social Service",
      description:
        "MIT WPU NCC Unit organised a Blood Donation Camp in collaboration with local blood banks, embodying the spirit of 'Blood Donation is Life Donation'.",
      content: JSON.stringify({
        overview:
          "The MIT WPU NCC Unit successfully organised a Blood Donation Camp on 9th October 2026 on the university campus. This noble initiative, conducted in collaboration with local blood banks, exemplified the NCC's commitment to social service and community welfare. The camp witnessed enthusiastic participation from NCC cadets, faculty, and students, all united by the belief that 'Blood Donation is Life Donation'.",
        purpose:
          "Blood donation is one of the most impactful forms of social service. The NCC, through its motto of 'Unity and Discipline', encourages cadets to contribute to society in meaningful ways. This camp aimed to instil the value of selfless service, raise awareness about the critical need for voluntary blood donation, and directly contribute to saving lives in the community.",
        organisingPartner: "Sasoon General Hospital Blood Bank, Pune",
        totalDonors: 62,
        unitsCollected: 58,
        appreciationMessage:
          "The MIT WPU NCC Unit extends heartfelt gratitude to all the brave donors who stepped forward to donate blood. Your selfless act of kindness has the power to save up to three lives per donation. We also thank our organising partner, the university administration, medical team, and all volunteers who made this camp a resounding success. The spirit of service demonstrated by every participant truly embodies the NCC values of 'Unity and Discipline'. Jai Hind!",
        highlights: [
          "Pre-donation health screening and counselling for all donors",
          "Awareness session on the importance of regular blood donation",
          "Post-donation refreshments and rest area arranged for all donors",
          "Certificates of appreciation distributed to all donors",
          "Blood group identification cards provided to participants",
        ],
      }),
    },
  });
  console.log("✅ Blood donation event created:", bloodEvent.title);

  // Create officers (placeholders - replace with real data)
  const officers = [
    { id: "officer-ano", name: "Lt. Col. [Name]", designation: "ANO", rank: "Lieutenant Colonel", bio: "Associate NCC Officer heading the MIT WPU NCC Unit", order: 1 },
    { id: "officer-co", name: "Capt. [Name]", designation: "CO", rank: "Captain", bio: "Company Commander of the MIT WPU NCC Unit", order: 2 },
    { id: "officer-suo", name: "SUO [Name]", designation: "SUO", rank: "Senior Under Officer", bio: "Senior Under Officer leading the cadet battalion", order: 3 },
    { id: "officer-juo", name: "JUO [Name]", designation: "JUO", rank: "Junior Under Officer", bio: "Junior Under Officer assisting in cadet training and discipline", order: 4 },
  ];

  for (const officer of officers) {
    await prisma.officer.upsert({
      where: { id: officer.id },
      update: {},
      create: officer,
    });
  }
  console.log("✅ Officers created (PLACEHOLDERS - update with real data)");

  // Create site stats
  await prisma.siteStats.upsert({
    where: { id: "main" },
    update: {},
    create: {
      id: "main",
      totalCadets: 150,
      totalEvents: 24,
      totalCamps: 8,
    },
  });
  console.log("✅ Site stats created");

  // Create announcements
  await prisma.announcement.create({
    data: {
      title: "NCC Registration Open for 2026-27",
      content: "New admissions for NCC cadets are now open. Register through the online portal. Limited seats available!",
      isActive: true,
      priority: 1,
    },
  });
  console.log("✅ Sample announcement created");

  console.log("\n🎉 Database seeded successfully!");
  console.log("\n📝 Admin email:", adminEmail);
  console.log("   (Password from SEED_ADMIN_PASSWORD env var - not printed for security)");
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
