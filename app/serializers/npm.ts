import ApplicationSerializer from './application';

export default ApplicationSerializer.extend({
  normalizeResponse(store, primaryModelClass, payload, id, requestType){
    const patchedPayload = {
      data: payload.results.map(pkg => {
        const jsonapiPackage = {
          type: 'npm',
          id: `${pkg.package.name}`,
          attributes: {
            ...pkg.package,
            ...pkg.score
          }
        };
        jsonapiPackage.attributes.link = jsonapiPackage.attributes.links.npm;

        return jsonapiPackage;
      })
    };
    return this._super(store, primaryModelClass, patchedPayload, id, requestType);
  }
});
