import ApplicationSerializer from './application';

export default ApplicationSerializer.extend({
  normalizeResponse(store, primaryModelClass, payload, id, requestType){
    const patchedPayload = {
      data: payload.addons.map(addon => ({
        type: 'addon',
        id: `${addon.id}`,
        attributes: {...addon}
      }))
    };
    return this._super(store, primaryModelClass, patchedPayload, id, requestType);
  }
});
