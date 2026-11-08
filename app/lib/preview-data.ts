/** All content here is illustrative UI copy. It is not connected to a database. */
export const previewItems = {
  tenant: {
    home: [
      {
        title: "Payments",
        description: "View rent and payment information.",
        href: "/tenant/payments",
        icon: "wallet",
      },
      {
        title: "Visitors",
        description: "Keep planned visit details together.",
        href: "/tenant/visitors",
        icon: "calendar",
      },
      {
        title: "Maintenance",
        description: "View requests and service updates.",
        href: "/tenant/maintenance",
        icon: "wrench",
      },
    ],
  },
  management: {
    queues: [
      {
        title: "Applications",
        description: "Review tenant applications and records.",
        href: "/management?accessRequests=1",
        icon: "users",
      },
      {
        title: "Rooms",
        description: "Review room capacity and occupancy.",
        href: "/management/rooms",
        icon: "building",
      },
      {
        title: "Payments",
        description: "Review payment records.",
        href: "/management/payments",
        icon: "wallet",
      },
    ],
  },
} as const;

export const previewAssumptions = [
  "All screen content is a UI preview. No account, room, payment, or notification data is stored or loaded.",
  "Billing labels and amounts are omitted until billing cadence, periods, and rate units are confirmed.",
  "The management preview uses shared navigation and does not represent owner or caretaker permissions.",
  "Forms and review actions are visual examples only; they do not submit or approve anything.",
  "Offline support, push notifications, and account recovery are outside this frontend foundation.",
];
