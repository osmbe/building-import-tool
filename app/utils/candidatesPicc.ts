import type { CandidateProperties } from './candidates'
import { addressTags, sourceGeometryTags } from './candidates'

export function piccTags(props: CandidateProperties): Record<string, string> {
  const tags: Record<string, string> = {
    ...addressTags(props),
    ...sourceGeometryTags(props)
  }

  const code = String(props.type_code ?? '')
    .toLowerCase()
    .trim()

  switch (code) {
    // Administration
    case 'adm':
      tags.building = 'public' // https://wiki.openstreetmap.org/wiki/Tag:building%3Dpublic
      break
    // Agricole
    case 'frm':
      tags.building = 'farm' // https://wiki.openstreetmap.org/wiki/Tag:building%3Dfarm
      break
    // Château
    case 'cht':
      tags.building = 'castle' // https://wiki.openstreetmap.org/wiki/Tag:building%3Dcastle
      break
    // Château d'eau
    case 'cee':
      tags.building = 'water_tower' // https://wiki.openstreetmap.org/wiki/Tag:building%3Dwater_tower
      tags.man_made = 'water_tower' // https://wiki.openstreetmap.org/wiki/Tag:man_made%3Dwater_tower
      break
    // Commerce ou service
    case 'mag':
      tags.building = 'commercial' // https://wiki.openstreetmap.org/wiki/Tag:building%3Dcommercial
      break
    // Culture, sport ou loisir
    case 'cul':
      tags.building = 'public' // https://wiki.openstreetmap.org/wiki/Tag:building%3Dpublic
      break
    // Gare
    case 'trg':
      tags.building = 'train_station' // https://wiki.openstreetmap.org/wiki/Tag:building%3Dtrain_station
      break
    // Habitation
    case 'bat':
      tags.building = 'house' // https://wiki.openstreetmap.org/wiki/Tag:building%3Dhouse
      break
    // Hôpital
    case 'hop':
      tags.building = 'hospital' // https://wiki.openstreetmap.org/wiki/Tag:building%3Dhospital
      break
    // Industriel
    case 'ids':
      tags.building = 'industrial' // https://wiki.openstreetmap.org/wiki/Tag:building%3Dindustrial
      break
    // Lieu de culte
    // case 'ldc':
    //   break
    // Maison communale / Hôtel de ville
    case 'hdv':
      tags.building = 'townhall' // https://wiki.openstreetmap.org/wiki/Tag:building%3Dtownhall
      tags.amenity = 'townhall' // https://wiki.openstreetmap.org/wiki/Tag:amenity%3Dtownhall
      break
    // Police
    case 'pol':
      tags.building = 'police' // https://wiki.openstreetmap.org/wiki/Tag:building%3Dpolice
      tags.amenity = 'police' // https://wiki.openstreetmap.org/wiki/Tag:amenity%3Dpolice
      break
    // Pompier
    case 'pom':
      tags.building = 'fire_station' // https://wiki.openstreetmap.org/wiki/Tag:building%3Dfire_station
      tags.amenity = 'fire_station' // https://wiki.openstreetmap.org/wiki/Tag:amenity%3Dfire_station
      break
    // Prison
    case 'pri':
      tags.building = 'prison' // https://wiki.openstreetmap.org/wiki/Tag:building%3Dprison
      break
    // Scolaire
    case 'sco':
    // Scolaire fondamental
    case 'scf':
    // Scolaire secondaire
    case 'scs':
      tags.building = 'school' // https://wiki.openstreetmap.org/wiki/Tag:building%3Dschool
      break
    // Scolaire supérieur
    case 'scu':
      tags.building = 'university' // https://wiki.openstreetmap.org/wiki/Tag:building%3Duniversity
      break
    // Annexe
    case 'ane':
    // Building
    case 'bui':
    // Maison de repos
    case 'mdr':
    // Station d'épuration
    case 'sde':
    // Station service
    case 'sts':
      tags.building = 'yes' // https://wiki.openstreetmap.org/wiki/Tag:building%3Dyes
      break
  }

  return tags
}
