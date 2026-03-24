export interface IBinUpgrade {
    from: string[],
    to: { label: string, epk: string },
}

export const upgradeMatrix: IBinUpgrade[] = [
    {
        from: ["8V0906259B", "8V0906259E", "8V0906259H", "8V0906259K"],
        to: {
            label: "8V0906259K__0003",
            epk: "SC8S50"
        }
    },
    {
        from: ["5G0906259A", "5G0906259D", "5G0906259L"],
        to: {
            label: "5G0906259L__0002",
            epk: "SC8S50"
        }
    },
    {
        from: ["8V0906264A", "8V0906264D", "8V0906264F", "8V0906264K", "8V0906264L", "8V0906264M"],
        to: {
            label: "8V0906264K__0003",
            epk: "SC8S50"
        }
    },
    {
        from: ["8S0906259C"],
        to: {
            label: "8S0906259C__0004",
            epk: "SC8S50"
        }
    }
]