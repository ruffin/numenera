define({
    countermeasure : {
        prob : 20,
        "name" : "countermeasure",
        // cures one or more debuffs or "all", one or more status effects or "all" 
        item_types : {
            "consumable" : {
                prob : 20,
                actions : [ "ingested" ]
            },
            "handheld" : {
                prob : 80,
                actions : [ "activated", "injected" ]
            },
            "worn" : {
                prob : 100,
                actions : [ "activated" ]
            },
            "placed" : {
                prob : 30,
                actions : [ "activated" ],
                range : [ "#none/200", "immediate/80", "short/10", "long/5", "extreme/1" ]
            }
        },
        durations : [ "one round/10", "ten minutes/30", "one hour/30", "one day/10" ]
        // buffs one or more buff_types, or protects against one or more damage_types
    }
});