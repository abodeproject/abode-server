var IsyGroup = require('./IsyGroup');
var findGroupsByMember = function (address, type) {
  var found = [];

  IsyGroup.groups.forEach(function (group) {
    if (!group.config.members || group.name === 'ISY') {
      return found;
    }
    var matches = group.config.members.filter(function (member) {
      return (member.address === address && parseInt(member.type) === type);
    });

    if (matches.length > 0) {
      found.push(group);
    }
  });

  return found;
};

module.exports = {
  findGroupsByMember: findGroupsByMember,
  IsyGroup: IsyGroup
};
